#!/usr/bin/env python3
"""OCR de planillas de alimentación con RapidOCR (gratis, ONNX).

Uso: ocr_planilla.py <img1> [<img2> ...]
Imprime JSON por stdout: {"imagenes": [{nombre, corralHeader, filas[]}]}
donde filas = [{linea, fecha, corral, cambioCorral}] (una por renglón,
ordenadas de arriba a abajo; el corral rige hasta el próximo cambio).

No falla el lote: si una imagen no se puede leer, sale con error propio.
"""

import json
import os
import re
import sys
from datetime import date


CANT_RUN = re.compile(r"[0-9OoSsIiLl]{2,}")
MAPEO_DIGITOS = str.maketrans(
    {"O": "0", "o": "0", "S": "5", "s": "5", "I": "1", "i": "1", "l": "1", "L": "1"}
)


def extraer_cantidad(resto):
    """Último número de la línea (sin fecha ni turno): la cantidad en kg.

    Prefiere tokens puramente numéricos; si no hay, acepta letras
    confundibles (O->0, S->5, I/l->1) siempre que haya >=2 dígitos.
    """
    if not resto:
        return None
    puros, mixtos = [], []
    for m in CANT_RUN.finditer(resto):
        run = m.group(0)
        if re.fullmatch(r"\d+", run):
            n = int(run)
            if 1 <= n <= 99999:
                puros.append(n)
        elif sum(1 for c in run if c.isdigit()) >= 2:
            t = run.translate(MAPEO_DIGITOS)
            if t.isdigit():
                n = int(t)
                if 1 <= n <= 99999:
                    mixtos.append(n)
    if puros:
        return puros[-1]
    if mixtos:
        return mixtos[-1]
    return None


def dia_mes_valido(d, mes):
    try:
        d, mes = int(d), int(mes)
    except (TypeError, ValueError):
        return False
    return 1 <= d <= 31 and 1 <= mes <= 12


def extraer_fecha(linea):
    """Fecha best-effort de un renglón + resto sin la fecha.

    Devuelve (fecha|None, resto). Formatos: explícita con separador,
    fusionada (5 dígitos [DD,MM]+resto como "03110" → 03/10; 4 dígitos [DD,MM]
    o [DD]+[último] como "2518" → 25/8, "2319" → 23/9) y con espacios
    ("12 10" → 12/10). Nunca 3 dígitos sueltos (son cantidades).
    """
    m = FECHA_RE.search(linea)
    if m:
        resto = linea[: m.start()] + " " + linea[m.end() :]
        return normalizar_fecha_simple(m.group(1), m.group(2), m.group(3)), resto
    for m in FUSION_RE.finditer(linea):
        tok = m.group(1)
        candidatos = []
        if len(tok) == 5:
            if dia_mes_valido(tok[0:2], tok[2:4]):
                candidatos.append((tok[0:2], tok[2:4], None, 1))
            if tok[2:3] != "0" and dia_mes_valido(tok[0:2], tok[2:3]):
                candidatos.append((tok[0:2], tok[2:3], None, 2))
            if tok[0:1] != "0" and dia_mes_valido(tok[0:1], tok[1:3]):
                candidatos.append((tok[0:1], tok[1:3], None, 2))
        elif len(tok) == 4:
            if dia_mes_valido(tok[0:2], tok[2:4]):
                candidatos.append((tok[0:2], tok[2:4], None, 0))
            elif tok[3:4] != "0" and dia_mes_valido(tok[0:2], tok[3:4]):
                candidatos.append((tok[0:2], tok[3:4], None, 1))
            elif tok[0:1] != "0" and dia_mes_valido(tok[0:1], tok[1:3]):
                candidatos.append((tok[0:1], tok[1:3], None, 2))
        if candidatos:
            candidatos.sort(key=lambda c: c[3])
            d, mes, _anio, _resto = candidatos[0]
            resto = linea[: m.start()] + " " + linea[m.end() :]
            return normalizar_fecha_simple(d, mes, None), resto
    m = ESPACIO_RE.search(linea)
    if m and dia_mes_valido(m.group(1), m.group(2)):
        resto = linea[: m.start()] + " " + linea[m.end() :]
        return normalizar_fecha_simple(m.group(1), m.group(2), None), resto
    return None, linea


def normalizar_fecha_simple(d, mes, anio):
    try:
        d, mes = int(d), int(mes)
        anio = int(anio) if anio else date.today().year
    except (TypeError, ValueError):
        return None
    if anio < 100:
        anio += 2000
    if d > 31 >= mes > 0:
        d, mes = mes, d
    if not (1 <= mes <= 12 and 1 <= d <= 31):
        return None
    return f"{anio:04d}-{mes:02d}-{d:02d}"


FECHA_RE = re.compile(r"(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?")
CAMBIO_RE = re.compile(r"(?:pas[oa]|pasa)\s*(?:al?|de)?\s*corral\s*(\d+)", re.I)
# Fecha sin separador, p.ej. "03110" (03/10 + resto) o "2518" (25/8 + resto).
FUSION_RE = re.compile(r"(?<!\d)(\d{3,5})(?!\d)")
# Fecha con espacios en vez de barras, como tokens sueltos ("12 10").
ESPACIO_RE = re.compile(r"(?<!\S)(\d{1,2})\s+(\d{1,2})(?!\S)")


def corral_cercano(palabras):
    """Primer 'corral' (no 'paso') + número más cercano en Y."""
    ordenadas = sorted(palabras, key=lambda p: p["y"])
    for i, p in enumerate(ordenadas):
        t = p["texto"].lower()
        m0 = re.match(r"^corral(\d{1,3})$", t)
        if m0:
            return m0.group(1)
        if not re.match(r"^corral[:.]?$", t):
            continue
        y = p["y"]
        ventana = [q for q in ordenadas if abs(q["y"] - y) <= 60]
        ctx = " ".join(q["texto"] for q in ventana)
        if re.search(r"(?:pas[oa]|pasa)", ctx, re.I):
            continue
        for q in ventana:
            if "_" in q["texto"]:
                m = re.search(r"(\d{1,3})", q["texto"])
                if m:
                    return m.group(1)
        best = None
        for q in ventana:
            if re.match(r"^\d{1,2}$", q["texto"].strip()):
                d = abs(q["y"] - y)
                if best is None or d < best[0]:
                    best = (d, q["texto"].strip())
        if best:
            return best[1]
    return None


def analizar(engine, ruta):
    res, _ = engine(ruta) or (None, None)
    palabras = []
    if res:
        for box, txt, _conf in res:
            txt = (txt or "").strip()
            if not txt:
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            palabras.append(
                {"texto": txt, "x": sum(xs) / len(xs), "y": sum(ys) / len(ys)}
            )
    palabras.sort(key=lambda p: p["y"])
    # Agrupar por Y (tolerancia ~1.5% del alto).
    if not palabras:
        return {"corralHeader": None, "filas": []}
    ys = [p["y"] for p in palabras]
    alto = max(ys) - min(ys) or 1
    tol = max(12.0, alto * 0.015)
    grupos = []
    for p in palabras:
        if grupos and abs(p["y"] - grupos[-1]["y"]) <= tol:
            g = grupos[-1]
            g["items"].append(p)
            g["y"] = sum(i["y"] for i in g["items"]) / len(g["items"])
        else:
            grupos.append({"y": p["y"], "items": [p]})
    corral_header = corral_cercano(palabras)
    corral = corral_header
    filas = []
    for g in grupos:
        linea = " ".join(
            i["texto"] for i in sorted(g["items"], key=lambda i: i["x"])
        )
        m_cambio = CAMBIO_RE.search(linea)
        if m_cambio:
            corral = m_cambio.group(1)
            filas.append({"linea": linea, "fecha": None, "corral": corral, "cambioCorral": True, "cantidad": None})
            continue
        fecha, resto = extraer_fecha(linea)
        if es_basura(linea, fecha is not None):
            continue
        filas.append(
            {
                "linea": linea,
                "fecha": fecha,
                "corral": corral,
                "cambioCorral": False,
                "cantidad": extraer_cantidad(resto),
            }
        )
    # Recortar renglones vacíos al final (pie de planilla sin datos).
    while filas and not filas[-1]["cambioCorral"] and not filas[-1]["linea"].strip() and not filas[-1]["fecha"]:
        filas.pop()
    return {"corralHeader": corral_header, "filas": filas}


def es_basura(linea, tiene_fecha):
    """Fila sin valor de datos: letra suelta o título de columna sin números."""
    if tiene_fecha:
        return False
    s = (linea or "").strip()
    if re.match(r"^[^0-9a-zA-ZñÑ]*[0-9a-zA-ZñÑ][^0-9a-zA-ZñÑ]*$", s):
        return True
    return bool(HEADER_RE.search(s)) and not re.search(r"\d{2,}", s)


HEADER_RE = re.compile(
    r"fecha|corral|detalle|cantidad|raci[oó]n|observ|titular", re.I
)


def iter_paginas(path):
    """Yields (nombre, ruta_imagen) — para PDFs, una por página renderizada."""
    if path.lower().endswith(".pdf"):
        import fitz

        doc = fitz.open(path)
        base = path[: -len(".pdf")] if path.lower().endswith(".pdf") else path
        for i, page in enumerate(doc):
            # Render adaptativo: si la página sale chica (<1500px), subir a 300dpi.
            pix = page.get_pixmap(dpi=200)
            if max(pix.width, pix.height) < 1500:
                pix = page.get_pixmap(dpi=300)
            out = f"{base}_p{i + 1}.png"
            pix.save(out)
            yield f"{path.split('/')[-1]} · pág. {i + 1}", out
        doc.close()
    else:
        yield path.split("/")[-1], path


def main():
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    out = []
    for ruta in sys.argv[1:]:
        try:
            for nombre, img in iter_paginas(ruta):
                try:
                    r = analizar(engine, img)
                    r["nombre"] = nombre
                    out.append(r)
                finally:
                    if img != ruta:
                        try:
                            os.remove(img)
                        except OSError:
                            pass
        except Exception as e:  # noqa: BLE001 - no voltear el lote
            out.append(
                {
                    "nombre": ruta.split("/")[-1],
                    "corralHeader": None,
                    "filas": [],
                    "error": str(e)[:200],
                }
            )
    json.dump({"imagenes": out}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
