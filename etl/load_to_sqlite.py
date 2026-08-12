import csv
import sqlite3
import os
import re

def safe_str(val, default=''):
    if val is None:
        return default
    return str(val).strip()

def parse_float(val, default=0.0):
    try:
        val_str = safe_str(val).replace('"', '').replace("'", '')
        if not val_str or val_str in ['*', 'N/D', 'no calculable', 'N/A']:
            return default
        return float(val_str)
    except (ValueError, TypeError):
        return default

def parse_dms(val):
    if not val:
        return 0.0
    val_str = safe_str(val)
    match = re.search(r'(\d+)°\s*(\d+)\'\s*([\d\.]+)"?\s*([NSEWnsew]?)', val_str)
    if match:
        deg = float(match.group(1))
        min_ = float(match.group(2))
        sec = float(match.group(3))
        dir_ = match.group(4).upper()
        dec = deg + (min_ / 60.0) + (sec / 3600.0)
        if dir_ in ['W', 'S']:
            dec = -dec
        return round(dec, 6)
    return parse_float(val_str)

def parse_int(val, default=0):
    try:
        val_str = safe_str(val).replace('"', '').replace("'", '').replace(',', '')
        if not val_str or val_str in ['*', 'N/D', 'N/A']:
            return default
        return int(float(val_str))
    except (ValueError, TypeError):
        return default

def extract_estado(ref_str):
    if not ref_str:
        return "DESCONOCIDO"
    parts = ref_str.split(',')
    if len(parts) > 1:
        return parts[-1].strip()
    return ref_str.strip()

state_names = {
    '01': 'Aguascalientes', '02': 'Baja California', '03': 'Baja California Sur',
    '04': 'Campeche', '05': 'Coahuila', '06': 'Colima', '07': 'Chiapas',
    '08': 'Chihuahua', '09': 'Ciudad de México', '10': 'Durango', '11': 'Guanajuato',
    '12': 'Guerrero', '13': 'Hidalgo', '14': 'Jalisco', '15': 'México',
    '16': 'Michoacán', '17': 'Morelos', '18': 'Nayarit', '19': 'Nuevo León',
    '20': 'Oaxaca', '21': 'Puebla', '22': 'Querétaro', '23': 'Quintana Roo',
    '24': 'San Luis Potosí', '25': 'Sinaloa', '26': 'Sonora', '27': 'Tabasco',
    '28': 'Tamaulipas', '29': 'Tlaxcala', '30': 'Veracruz', '31': 'Yucatán', '32': 'Zacatecas'
}

def build_sqlite_db(data_dir="data", db_path="db/sismos.db"):
    print("==================================================")
    print(" CREANDO BASE DE DATOS SQLITE (CON ECONOMIA INEGI)")
    print("==================================================\n")

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE dim_sismos (
        id_sismo INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_utc TEXT,
        hora_utc TEXT,
        magnitud REAL,
        latitud REAL,
        longitud REAL,
        profundidad REAL,
        referencia_localizacion TEXT,
        estado TEXT
    );
    """)

    cursor.execute("""
    CREATE TABLE dim_zonas (
        id_zona INTEGER PRIMARY KEY AUTOINCREMENT,
        clave_entidad TEXT,
        entidad TEXT,
        municipio TEXT,
        latitud REAL,
        longitud REAL,
        poblacion_total INTEGER
    );
    """)

    cursor.execute("""
    CREATE TABLE dim_economia (
        id_economia INTEGER PRIMARY KEY AUTOINCREMENT,
        clave_entidad TEXT,
        entidad TEXT,
        unidades_economicas INTEGER,
        personal_ocupado INTEGER,
        produccion_bruta_total REAL
    );
    """)

    cursor.execute("CREATE INDEX idx_sismos_mag ON dim_sismos(magnitud);")
    cursor.execute("CREATE INDEX idx_sismos_fecha ON dim_sismos(fecha_utc);")
    cursor.execute("CREATE INDEX idx_zonas_pob ON dim_zonas(poblacion_total);")

    # 1. Ingesta Sismos
    sismos_csv = os.path.join(data_dir, "sismos_ssn.csv")
    if os.path.exists(sismos_csv):
        print(f"Cargando sismos desde {sismos_csv}...")
        sismos_batch = []
        with open(sismos_csv, mode='r', encoding='utf-8-sig', errors='replace') as infile:
            lines = [l for l in infile if not (l.startswith('"Catalogo') or l.startswith('"Informacion') or l.startswith('"Sismicidad') or l.startswith('"Total:'))]
            reader = csv.DictReader(lines)
            for row in reader:
                if not row: continue
                fecha_str = safe_str(row.get('Fecha UTC')) or safe_str(row.get('Fecha'))
                hora_str = safe_str(row.get('Hora UTC')) or safe_str(row.get('Hora'))
                magnitud = parse_float(row.get('Magnitud'))
                lat = parse_float(row.get('Latitud'))
                lon = parse_float(row.get('Longitud'))
                prof = parse_float(row.get('Profundidad'))
                ref = safe_str(row.get('Referencia de localizacion'))
                estado = extract_estado(ref)

                if (-125.0 <= lon <= -80.0 and 10.0 <= lat <= 35.0) and magnitud > 0:
                    sismos_batch.append((fecha_str, hora_str, magnitud, lat, lon, prof, ref, estado))

                if len(sismos_batch) >= 50000:
                    cursor.executemany("""
                    INSERT INTO dim_sismos (fecha_utc, hora_utc, magnitud, latitud, longitud, profundidad, referencia_localizacion, estado)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, sismos_batch)
                    conn.commit()
                    sismos_batch = []

        if sismos_batch:
            cursor.executemany("""
            INSERT INTO dim_sismos (fecha_utc, hora_utc, magnitud, latitud, longitud, profundidad, referencia_localizacion, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, sismos_batch)
            conn.commit()

        print("-> Sismos insertados exitosamente.")

    # 2. Ingesta Población
    pob_csv = os.path.join(data_dir, "poblacion_inegi.csv")
    if os.path.exists(pob_csv):
        print(f"Cargando población desde {pob_csv}...")
        pob_batch = []
        with open(pob_csv, mode='r', encoding='utf-8-sig', errors='replace') as infile:
            reader = csv.DictReader(infile)
            for row in reader:
                if not row: continue
                nom_loc = safe_str(row.get('NOM_LOC'))
                nom_mun = safe_str(row.get('NOM_MUN'))
                if nom_mun in ['Total nacional'] or nom_loc in ['Total nacional', 'Total de la Entidad']:
                    continue
                cve = safe_str(row.get('ENTIDAD')).zfill(2)
                ent = safe_str(row.get('NOM_ENT'))
                pob = parse_int(row.get('POBTOT'))
                lat = parse_dms(row.get('LATITUD'))
                lon = parse_dms(row.get('LONGITUD'))

                if ent and pob > 0:
                    pob_batch.append((cve, ent, nom_mun, lat, lon, pob))

                if len(pob_batch) >= 20000:
                    cursor.executemany("""
                    INSERT INTO dim_zonas (clave_entidad, entidad, municipio, latitud, longitud, poblacion_total)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, pob_batch)
                    conn.commit()
                    pob_batch = []

        if pob_batch:
            cursor.executemany("""
            INSERT INTO dim_zonas (clave_entidad, entidad, municipio, latitud, longitud, poblacion_total)
            VALUES (?, ?, ?, ?, ?, ?)
            """, pob_batch)
            conn.commit()

        print("-> Población insertada exitosamente.")

    # 3. Ingesta Economía (Censos Económicos INEGI)
    econ_csv = os.path.join(data_dir, "economia_inegi.csv")
    if os.path.exists(econ_csv):
        print(f"Cargando economía desde {econ_csv}...")
        econ_batch = []
        with open(econ_csv, mode='r', encoding='utf-8-sig', errors='replace') as infile:
            reader = csv.DictReader(infile)
            for row in reader:
                if not row: continue
                codigo = safe_str(row.get('CODIGO'))
                if codigo == 'TOTAL DE SECTOR':
                    cve = safe_str(row.get('E03')).zfill(2)
                    ue = parse_int(row.get('UE'))
                    po = parse_int(row.get('H001A'))
                    pbt = parse_float(row.get('M000A') or row.get('A111A'))
                    ent_nombre = state_names.get(cve, f"Entidad_{cve}")

                    if cve and ue > 0:
                        econ_batch.append((cve, ent_nombre, ue, po, pbt))

        if econ_batch:
            cursor.executemany("""
            INSERT INTO dim_economia (clave_entidad, entidad, unidades_economicas, personal_ocupado, produccion_bruta_total)
            VALUES (?, ?, ?, ?, ?)
            """, econ_batch)
            conn.commit()

        print("-> Economía insertada exitosamente.")

    conn.close()
    print("==================================================")
    print(f" BASE DE DATOS SQLITE LISTA EN: {db_path}")
    print("==================================================")

if __name__ == "__main__":
    build_sqlite_db()
