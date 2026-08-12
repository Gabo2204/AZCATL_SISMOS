import csv
import sys
import os
from datetime import datetime

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

def parse_int(val, default=0):
    try:
        val_str = safe_str(val).replace('"', '').replace("'", '').replace(',', '')
        if not val_str or val_str in ['*', 'N/D', 'N/A']:
            return default
        return int(float(val_str))
    except (ValueError, TypeError):
        return default

def extract_estado(ref_str):
    """Extrae la abreviatura o nombre de estado de la referencia del SSN."""
    if not ref_str:
        return "DESCONOCIDO"
    parts = ref_str.split(',')
    if len(parts) > 1:
        return parts[-1].strip()
    return ref_str.strip()

def process_ssn_csv(input_path, outfile):
    """Procesa el archivo sismos_ssn.csv omitiendo encabezados de metadatos."""
    print(f"Procesando sismos desde: {input_path}")
    valid_count = 0
    invalid_count = 0

    with open(input_path, mode='r', encoding='utf-8-sig', errors='replace') as infile:
        lines = []
        for line in infile:
            if line.startswith('"Catalogo') or line.startswith('"Informacion') or line.startswith('"Sismicidad') or line.startswith('"Total:'):
                continue
            lines.append(line)

        reader = csv.DictReader(lines)
        for row in reader:
            if not row:
                continue
            
            fecha_str = safe_str(row.get('Fecha UTC')) or safe_str(row.get('Fecha'))
            hora_str = safe_str(row.get('Hora UTC')) or safe_str(row.get('Hora'))
            magnitud = parse_float(row.get('Magnitud'))
            lat = parse_float(row.get('Latitud'))
            lon = parse_float(row.get('Longitud'))
            prof = parse_float(row.get('Profundidad'))
            ref = safe_str(row.get('Referencia de localizacion')).replace("'", "''")
            estado = extract_estado(ref).replace("'", "''")

            if not (-125.0 <= lon <= -80.0 and 10.0 <= lat <= 35.0) or magnitud <= 0:
                invalid_count += 1
                continue

            try:
                fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                invalid_count += 1
                continue

            outfile.write(
                f"INSERT INTO dim_tiempo (fecha, anio, mes, dia, trimestre) "
                f"VALUES ('{fecha_obj}', {fecha_obj.year}, {fecha_obj.month}, {fecha_obj.day}, {(fecha_obj.month - 1) // 3 + 1}) "
                f"ON CONFLICT (fecha) DO NOTHING;\n"
            )

            outfile.write(
                f"INSERT INTO dim_sismos (fecha_utc, hora_utc, magnitud, latitud, longitud, profundidad, referencia_localizacion, estado) "
                f"VALUES ('{fecha_obj}', '{hora_str if hora_str else '00:00:00'}', {magnitud}, {lat}, {lon}, {prof}, '{ref}', '{estado}');\n"
            )
            valid_count += 1

            if valid_count % 50000 == 0:
                print(f"  --> {valid_count} sismos procesados...")

    print(f"-> Sismos completados: {valid_count} válidos, {invalid_count} descartados.\n")

def process_inegi_poblacion(input_path, outfile):
    """Procesa el CSV de Población de INEGI (Censo 2020)."""
    print(f"Procesando población desde: {input_path}")
    valid_count = 0

    with open(input_path, mode='r', encoding='utf-8-sig', errors='replace') as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            if not row:
                continue

            nom_loc = safe_str(row.get('NOM_LOC'))
            nom_mun = safe_str(row.get('NOM_MUN'))
            
            if nom_mun in ['Total nacional'] or nom_loc in ['Total nacional', 'Total de la Entidad']:
                continue

            cve = safe_str(row.get('ENTIDAD')).zfill(2)
            ent = safe_str(row.get('NOM_ENT')).replace("'", "''")
            mun = nom_mun.replace("'", "''")
            pob = parse_int(row.get('POBTOT'))
            lat = parse_float(row.get('LATITUD'))
            lon = parse_float(row.get('LONGITUD'))

            if ent and pob > 0:
                outfile.write(
                    f"INSERT INTO dim_zonas (clave_entidad, entidad, municipio, latitud, longitud, poblacion_total) "
                    f"VALUES ('{cve}', '{ent}', '{mun}', {lat}, {lon}, {pob});\n"
                )
                valid_count += 1

                if valid_count % 20000 == 0:
                    print(f"  --> {valid_count} registros de población procesados...")

    print(f"-> Población completada: {valid_count} registros cargados.\n")

def process_inegi_economia(input_path, outfile):
    """Procesa el CSV de Censos Económicos INEGI."""
    print(f"Procesando economía desde: {input_path}")
    valid_count = 0

    with open(input_path, mode='r', encoding='utf-8-sig', errors='replace') as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            if not row:
                continue

            codigo = safe_str(row.get('CODIGO'))
            if codigo == 'TOTAL DE SECTOR':
                cve = safe_str(row.get('E03')).zfill(2)
                ue = parse_int(row.get('UE'))
                po = parse_int(row.get('H001A'))
                pbt = parse_float(row.get('M000A') or row.get('A111A'))

                if cve:
                    outfile.write(
                        f"INSERT INTO dim_economia (clave_entidad, entidad, unidades_economicas, personal_ocupado, produccion_bruta_total) "
                        f"VALUES ('{cve}', 'Entidad_{cve}', {ue}, {po}, {pbt});\n"
                    )
                    valid_count += 1

    print(f"-> Economía completada: {valid_count} registros cargados.\n")

def main():
    data_dir = "data"
    output_sql = "db/import_data.sql"
    
    print("==================================================")
    print(" INICIANDO PROCESAMIENTO ETL (SSN + INEGI)")
    print("==================================================\n")

    os.makedirs(os.path.dirname(output_sql), exist_ok=True)

    with open(output_sql, mode='w', encoding='utf-8') as outfile:
        outfile.write("-- Script SQL de importación automática masiva\n")
        outfile.write("BEGIN;\n\n")

        sismos_csv = os.path.join(data_dir, "sismos_ssn.csv")
        if os.path.exists(sismos_csv):
            process_ssn_csv(sismos_csv, outfile)
        else:
            print(f"¡Advertencia! No se encontró {sismos_csv}")

        pob_csv = os.path.join(data_dir, "poblacion_inegi.csv")
        if os.path.exists(pob_csv):
            process_inegi_poblacion(pob_csv, outfile)
        else:
            print(f"¡Advertencia! No se encontró {pob_csv}")

        econ_csv = os.path.join(data_dir, "economia_inegi.csv")
        if os.path.exists(econ_csv):
            process_inegi_economia(econ_csv, outfile)
        else:
            print(f"¡Advertencia! No se encontró {econ_csv}")

        outfile.write("\nCOMMIT;\n")

    print("==================================================")
    print(f" ETL FINALIZADO. SQL generado en: {output_sql}")
    print("==================================================")

if __name__ == "__main__":
    main()
