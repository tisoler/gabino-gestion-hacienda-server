import { BadRequestException, Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { Jimp } from "jimp";

const execFileAsync = promisify(execFile);

/** Fila best-effort del preview (una por renglón de grilla detectado). */
export interface OcrFila {
  /** Texto crudo del renglón (palabras TSV, puede estar vacío). */
  linea: string;
  /** Fecha detectada 'YYYY-MM-DD' o null. */
  fecha: string | null;
  /** Corral que aplica a esta fila (header o el del último "paso a corral N"). */
  corral: string | null;
  /** Cantidad en kg detectada (último número de la fila sin fecha) o null. */
  cantidad: number | null;
  /** true si esta fila marca un cambio de corral ("paso a corral N"). */
  cambioCorral: boolean;
}

export interface OcrResultado {
  /** Nombre del archivo o página ("planilla.pdf · pág. 2"). */
  nombre: string;
  /** Corral del encabezado (primer "CORRAL N" que no es "paso/pasa"). */
  corralHeader: string | null;
  filas: OcrFila[];
}

/** Palabra TSV con su centro vertical (en px de la imagen original). */
interface Palabra {
  texto: string;
  yCentro: number;
}

@Injectable()
export class OcrService {
  /** Tmp real (sin symlinks: /tmp en macOS rompe a este tesseract). */
  private async tmpBase(): Promise<string> {
    return realpath(tmpdir());
  }

  /**
   * Analiza un archivo (foto o PDF) con RapidOCR (Python, gratis, ONNX).
   * Devuelve un resultado por imagen/página. Si Python o RapidOCR no están
   * disponibles, usa el pipeline tesseract de respaldo (sólo imágenes;
   * peor en manuscrita).
   */
  async analizarPlanilla(
    buffer: Buffer,
    nombreOriginal?: string,
  ): Promise<OcrResultado[]> {
    const ext = (nombreOriginal?.split(".").pop() || "jpg").toLowerCase();
    const esPdf = ext === "pdf";
    const base = (nombreOriginal || "planilla")
      .split("/")
      .pop()!
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(-80);
    const nombreTmp = /\.(jpg|jpeg|png|webp|tiff?|bmp|pdf)$/i.test(base)
      ? base
      : `${base}.${esPdf ? "pdf" : "jpg"}`;
    if (
      !esPdf &&
      !["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp"].includes(ext)
    ) {
      throw new BadRequestException(
        "Formato no soportado (JPG/PNG/WEBP/TIFF/BMP/PDF)",
      );
    }
    try {
      return await this.analizarRapidOcr(buffer, nombreTmp);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        // Sin python/tesseract: error claro en vez de fallback silencioso.
        throw new BadRequestException(
          "OCR no disponible en el servidor (falta python3 con rapidocr o tesseract)",
        );
      }
      if (esPdf) throw err;
      // RapidOCR falló (modelo, imagen, etc.): respaldo tesseract.
      return [await this.analizarTesseract(buffer)];
    }
  }

  /** Vía script Python (agrupa por renglón, mejor en manuscrita). */
  private async analizarRapidOcr(
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<OcrResultado[]> {
    const base = await this.tmpBase();
    const dir = await mkdtemp(join(base, "ocr-"));
    try {
      const input = join(dir, nombreArchivo);
      await writeFile(input, buffer);
      const script = join(__dirname, "ocr_planilla.py");
      const bin = process.env.PYTHON_BIN || "python3";
      const { stdout } = await execFileAsync(bin, [script, input], {
        timeout: 300000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout);
      const imgs = parsed?.imagenes;
      if (!Array.isArray(imgs) || imgs.length === 0) {
        throw new BadRequestException("El OCR no devolvió resultados");
      }
      return imgs.map((r: any) => ({
        nombre:
          typeof r?.nombre === "string" && r.nombre ? r.nombre : nombreArchivo,
        corralHeader:
          typeof r?.corralHeader === "string" ? r.corralHeader : null,
        filas: (Array.isArray(r?.filas) ? r.filas : []).map((f: any) => ({
          linea: String(f?.linea ?? ""),
          fecha: typeof f?.fecha === "string" ? f.fecha : null,
          corral: typeof f?.corral === "string" ? f.corral : null,
          cantidad: typeof f?.cantidad === "number" ? f.cantidad : null,
          cambioCorral: f?.cambioCorral === true,
        })),
      }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Respaldo tesseract: detecta los renglones de la grilla por derivada
   * vertical y asigna palabras TSV a cada renglón. Peor en manuscrita que
   * RapidOCR, pero sin dependencias extra.
   */
  private async analizarTesseract(buffer: Buffer): Promise<OcrResultado> {
    const base = await this.tmpBase();
    const dir = await mkdtemp(join(base, "ocr-"));
    try {
      // Imagen 2x para el OCR (el resize plano dio mejores lecturas que
      // variantes con contraste en estas fotos).
      // OJO: resize muta in-place → leer el alto ANTES.
      const img = await Jimp.read(buffer);
      const hNat = img.bitmap.height;
      const big = img.resize({ w: img.bitmap.width * 2 });
      const png = join(dir, "plan.png") as `${string}.${string}`;
      await big.write(png);
      const escala = hNat / big.bitmap.height;

      const palabras = await this.palabrasTsv(png, join(dir, "out"));
      const bandas = await this.detectarBandas(buffer);
      return this.armarFilas(palabras, bandas, escala, hNat);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new BadRequestException(
          "El motor de OCR (tesseract) no está instalado en el servidor",
        );
      }
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException("No se pudo procesar la imagen");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Renglones de la grilla: picos de la derivada vertical promedio (las
   * líneas horizontales, aunque tenues, cruzan todo el ancho). Devuelve
   * bandas [y0, y1] en px de la imagen original, con gaps de 2%-9% del alto.
   */
  private async detectarBandas(
    buffer: Buffer,
  ): Promise<{ y0: number; y1: number }[]> {
    const img = await Jimp.read(buffer);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    const data = img.bitmap.data;
    const prof: number[] = new Array(h - 1).fill(0);
    for (let y = 0; y < h - 1; y++) {
      let acc = 0;
      let n = 0;
      for (let x = 0; x < w; x += 2) {
        const i0 = (y * w + x) * 4;
        const i1 = ((y + 1) * w + x) * 4;
        acc += Math.abs(data[i0] - data[i1]);
        n++;
      }
      prof[y] = acc / n;
    }
    const sm = prof.map((_, i) => {
      const a = Math.max(0, i - 1);
      const b = Math.min(prof.length - 1, i + 1);
      let s = 0;
      for (let j = a; j <= b; j++) s += prof[j];
      return s / (b - a + 1);
    });
    const mean = sm.reduce((a, b) => a + b, 0) / sm.length;
    const sd = Math.sqrt(
      sm.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sm.length,
    );
    const lim = mean + 1.2 * sd;
    const lineas: number[] = [];
    let last = -100;
    for (let y = 0; y < sm.length; y++) {
      if (sm[y] > lim && y - last > 15) {
        lineas.push(y);
        last = y;
      }
    }
    const bandas: { y0: number; y1: number }[] = [];
    for (let i = 0; i < lineas.length - 1; i++) {
      const gap = lineas[i + 1] - lineas[i];
      if (gap >= h * 0.02 && gap <= h * 0.09) {
        bandas.push({ y0: lineas[i], y1: lineas[i + 1] });
      }
    }
    return bandas;
  }

  /** Palabras de tesseract TSV (psm 6, español) con centro vertical. */
  private async palabrasTsv(
    pngPath: string,
    outBase: string,
  ): Promise<Palabra[]> {
    const bin = process.env.TESSERACT_BIN || "tesseract";
    await execFileAsync(
      bin,
      [pngPath, outBase, "-l", "spa", "--psm", "6", "tsv"],
      { timeout: 60000 },
    );
    const raw = await readFile(`${outBase}.tsv`, "utf8");
    const out: Palabra[] = [];
    for (const l of raw.split("\n").slice(1)) {
      const c = l.split("\t");
      if (c.length < 12) continue;
      const txt = (c[11] || "").trim();
      if (!txt) continue;
      const top = Number(c[7]);
      const hh = Number(c[9]);
      if (!isFinite(top) || !isFinite(hh)) continue;
      out.push({ texto: txt, yCentro: top + hh / 2 });
    }
    return out;
  }

  /**
   * Arma las filas: texto por banda (palabras cuyo centro cae adentro),
   * encabezado = primera banda con palabra clave, cuerpo = las siguientes.
   * Sin bandas: fallback al parseo por líneas de texto.
   */
  private armarFilas(
    palabras: Palabra[],
    bandas: { y0: number; y1: number }[],
    escala: number,
    hNat: number,
  ): OcrResultado {
    const fechaRe = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/;
    const cambioCorralRe = /(?:pas[oa]|pasa)\s*(?:al?|de)?\s*corral\s*(\d+)/i;
    const sinAcentos = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const esEncabezado = (t: string) => {
      const n = sinAcentos(t);
      if (cambioCorralRe.test(t)) return false;
      return /fecha|corral|detalle|cantidad|racion|observ|titular/.test(n);
    };

    // Palabras en coords nativas, ordenadas por Y.
    const nativas = palabras
      .map((p) => ({ texto: p.texto, y: p.yCentro * escala }))
      .sort((a, b) => a.y - b.y);

    const textos = bandas.map((b) =>
      palabras
        .filter((p) => p.yCentro * escala >= b.y0 && p.yCentro * escala < b.y1)
        .map((p) => p.texto)
        .join(" "),
    );

    // Sin bandas útiles: devolver vacío (la UI agrega fila manual).
    if (textos.length === 0) {
      return { nombre: "", corralHeader: null, filas: [] };
    }

    let ini = textos.findIndex((t) => esEncabezado(t));
    if (ini < 0) {
      // Sin encabezado legible: el cuerpo arranca en el último cuarto.
      ini = textos.findIndex((_, i) => i >= 0 && bandas[i].y0 >= hNat * 0.25);
      if (ini < 0) ini = 0;
    }

    // Encabezado de la planilla: primer "corral" (que no sea "paso/pasa")
    // + número más cercano en Y (el renglón manuscrito suele pisar la línea
    // de grilla y el número cae en otra banda; se prefiere blanco "____N").
    const corralHeader = this.corralCercano(nativas);

    let corralActual = corralHeader;
    const filas: OcrFila[] = [];
    for (let i = ini + 1; i < textos.length; i++) {
      const linea = textos[i].trim();
      const cambio = linea.match(cambioCorralRe);
      if (cambio) {
        corralActual = cambio[1];
        filas.push({
          linea,
          fecha: null,
          corral: corralActual,
          cantidad: null,
          cambioCorral: true,
        });
        continue;
      }
      const f = linea.match(fechaRe);
      filas.push({
        linea,
        fecha: f ? this.normalizarFecha(f) : null,
        corral: corralActual,
        cantidad: null,
        cambioCorral: false,
      });
    }
    // Recortar renglones vacíos al final (pie de planilla sin datos).
    while (
      filas.length > 0 &&
      !filas[filas.length - 1].cambioCorral &&
      filas[filas.length - 1].linea.trim() === "" &&
      filas[filas.length - 1].fecha == null
    ) {
      filas.pop();
    }
    return { nombre: "", corralHeader, filas };
  }

  /**
   * Número de corral más cercano (en Y) a un token "corral" que no sea
   * "paso/pasa". Tolera que el número caiga en otro renglón (manuscrito sobre
   * la línea de grilla). Prefiere blancos completados ("____6") y si no, el
   * número puro más cercano (≤2 dígitos).
   */
  private corralCercano(
    nativas: { texto: string; y: number }[],
  ): string | null {
    const VENTANA = 60;
    for (let i = 0; i < nativas.length; i++) {
      const t = nativas[i].texto.toLowerCase();
      const directo = t.match(/^corral(\d{1,3})$/);
      if (directo) return directo[1];
      if (!/^corral[:.]?$/.test(t)) continue;
      const y = nativas[i].y;
      const ventana = nativas.filter((p) => Math.abs(p.y - y) <= VENTANA);
      const ctx = ventana.map((p) => p.texto).join(" ");
      if (/(?:pas[oa]|pasa)/i.test(ctx)) continue;
      for (const p of ventana) {
        if (/_/.test(p.texto)) {
          const m = p.texto.match(/(\d{1,3})/);
          if (m) return m[1];
        }
      }
      let best: { d: number; v: string } | null = null;
      for (const p of ventana) {
        const s = p.texto.trim();
        if (/^\d{1,2}$/.test(s)) {
          const d = Math.abs(p.y - y);
          if (!best || d < best.d) best = { d, v: s };
        }
      }
      if (best) return best.v;
    }
    return null;
  }

  /** Normaliza un match de fecha a 'YYYY-MM-DD' (asume año actual si falta). */
  private normalizarFecha(m: RegExpMatchArray): string {
    let d = Number(m[1]);
    let mes = Number(m[2]);
    let anio = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (anio < 100) anio += 2000;
    if (d > 31 && mes <= 12) {
      // Formato "MM/DD" invertido por OCR.
      [d, mes] = [mes, d];
    }
    if (mes < 1 || mes > 12 || d < 1 || d > 31) {
      return new Date().toISOString().slice(0, 10);
    }
    const mm = `${mes}`.padStart(2, "0");
    const dd = `${d}`.padStart(2, "0");
    return `${anio}-${mm}-${dd}`;
  }
}
