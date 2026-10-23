import { BadRequestException, Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";

/** Fila de preview de una planilla xlsx (tabla izquierda FECHA|ALIMENTO|CANTIDAD|OBS). */
export interface ExcelFila {
  /** Texto crudo del renglón (referencia para corregir). */
  linea: string;
  /** Fecha 'YYYY-MM-DD' o null. */
  fecha: string | null;
  /** Dieta tal cual figura en la planilla (el match con catálogo es en la UI). */
  dieta: string | null;
  /** Cantidad (número líder de la celda) o null. */
  cantidad: number | null;
  /** Turno 'M'|'T' o null. */
  turno: string | null;
  /** Hora por defecto según turno (M 09:00, resto 09:00 salvo T 15:00). */
  hora: string;
  /** Corral (encabezado de la hoja o del último "paso a corral N"). */
  corral: string | null;
  /** true si la fila marca un cambio de corral ("paso a corral N"). */
  cambioCorral: boolean;
}

export interface ExcelHoja {
  nombre: string;
  corralHeader: string | null;
  filas: ExcelFila[];
}

const CAMBIO_CORRAL_RE = /(?:pas[oa]|pasa)\s*(?:al?|de)?\s*corral\s*(\d+)/i;
const CORRAL_RE = /corral\s*:?\s*(\d{1,3})/i;
const FECHA_RE = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/;
const MAX_FILAS = 2000;

@Injectable()
export class ExcelService {
  /**
   * Parsea un .xlsx de planillas: una hoja por lote/corral, tabla izquierda
   * (A=FECHA serial o texto, B=ALIMENTO, C=CANTIDAD, D=OBS con turno M/T).
   * Devuelve un preview best-effort por hoja (sin reconstruir lotes ni
   * guardar nada).
   */
  async analizarPlanilla(buffer: Buffer): Promise<{ hojas: ExcelHoja[] }> {
    let wb: ExcelJS.Workbook;
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException("No se pudo leer el archivo Excel (.xlsx)");
    }
    const hojas: ExcelHoja[] = [];
    wb.eachSheet((ws) => {
      hojas.push(this.analizarHoja(ws));
    });
    return { hojas };
  }

  private analizarHoja(ws: ExcelJS.Worksheet): ExcelHoja {
    const texto = (v: ExcelJS.CellValue | undefined | null): string => {
      if (v == null) return "";
      if (v instanceof Date) return "";
      if (typeof v === "object") {
        const rich = v as { richText?: { text: string }[] };
        if (Array.isArray(rich.richText)) {
          return rich.richText.map((t) => t.text).join("");
        }
        const f = v as { result?: unknown };
        if (f.result != null) return String(f.result);
        return "";
      }
      return String(v);
    };

    // Corral: nombre de hoja ("... CORRAL 1") o fila 1 ("CORRAL: 6").
    let corralHeader: string | null = null;
    const mHoja = ws.name.match(CORRAL_RE);
    if (mHoja) {
      corralHeader = mHoja[1];
    } else {
      const primera = ws.getRow(1);
      for (let c = 1; c <= 8; c++) {
        const m = texto(primera.getCell(c).value).match(CORRAL_RE);
        if (m) {
          corralHeader = m[1];
          break;
        }
      }
    }

    // Fila de encabezado: primera con "FECHA" en col A.
    let ini = 0;
    ws.eachRow((row, n) => {
      if (
        ini === 0 &&
        texto(row.getCell(1).value).trim().toUpperCase() === "FECHA"
      ) {
        ini = n;
      }
    });

    const filas: ExcelFila[] = [];
    if (ini > 0) {
      let corral = corralHeader;
      const ultima = Math.min(ws.rowCount, ini + MAX_FILAS);
      for (let n = ini + 1; n <= ultima; n++) {
        const row = ws.getRow(n);
        const cFecha = texto(row.getCell(1).value).trim();
        const cDieta = texto(row.getCell(2).value).trim();
        const cCant = texto(row.getCell(3).value).trim();
        const cObs = texto(row.getCell(4).value).trim();
        if (!cFecha && !cDieta && !cCant && !cObs) continue;
        const cambio =
          cObs.match(CAMBIO_CORRAL_RE) || cDieta.match(CAMBIO_CORRAL_RE);
        if (cambio) {
          corral = cambio[1];
          filas.push({
            linea: [cFecha, cDieta, cCant, cObs].filter(Boolean).join(" | "),
            fecha: null,
            dieta: null,
            cantidad: null,
            turno: null,
            hora: "09:00",
            corral,
            cambioCorral: true,
          });
          continue;
        }
        filas.push({
          linea: [cFecha, cDieta, cCant, cObs].filter(Boolean).join(" | "),
          fecha: this.parsearFecha(row.getCell(1).value),
          dieta: cDieta || null,
          cantidad: this.parsearCantidad(cCant),
          turno: this.parsearTurno(cObs),
          hora: this.horaPorTurno(this.parsearTurno(cObs)),
          corral,
          cambioCorral: false,
        });
      }
    }
    return { nombre: ws.name, corralHeader, filas };
  }

  private parsearFecha(v: ExcelJS.CellValue | undefined | null): string | null {
    if (v == null) return null;
    if (v instanceof Date)
      return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
    if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (isNaN(d.getTime())) return null;
      const iso = d.toISOString().slice(0, 10);
      return iso >= "2000-01-01" && iso <= "2100-01-01" ? iso : null;
    }
    if (typeof v === "string") {
      const m = v.trim().match(FECHA_RE);
      if (m) return this.normalizarFecha(m[1], m[2], m[3]);
      if (/^\d{5}$/.test(v.trim())) {
        const n = Number(v.trim());
        if (n > 20000 && n < 80000) {
          const d = new Date(Math.round((n - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
      }
    }
    return null;
  }

  private normalizarFecha(
    d: string,
    mes: string,
    anio?: string,
  ): string | null {
    let dd = Number(d);
    let mm = Number(mes);
    let yy = anio ? Number(anio) : new Date().getFullYear();
    if (!isFinite(dd) || !isFinite(mm) || !isFinite(yy)) return null;
    if (yy < 100) yy += 2000;
    if (dd > 31 && mm <= 12) [dd, mm] = [mm, dd];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yy}-${`${mm}`.padStart(2, "0")}-${`${dd}`.padStart(2, "0")}`;
  }

  private parsearCantidad(v: string): number | null {
    const m = v
      .trim()
      .replace(",", ".")
      .match(/^(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  private parsearTurno(obs: string): string | null {
    const t = obs.trim().toUpperCase();
    if (t === "M" || t.startsWith("MAÑANA") || t.startsWith("MANANA"))
      return "M";
    if (t === "T" || t.startsWith("TARDE")) return "T";
    return null;
  }

  private horaPorTurno(turno: string | null): string {
    if (turno === "T") return "15:00";
    return "09:00";
  }
}
