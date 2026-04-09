import sys, os, subprocess
sys.stdout.reconfigure(encoding='utf-8')

result = subprocess.run(
    ['python', 'scripts/comparar_nomina_excel.py'],
    capture_output=True, text=True, encoding='utf-8', errors='replace',
    cwd='C:/Proyectos/nomina-iesef'
)
lines = result.stdout.split('\n')

prog_menos = {}
prog_mas   = {}

for line in lines:
    if '⬇' not in line and '⬆' not in line:
        continue
    parts = line.split()
    # Find program column (after docente name)
    for i, p in enumerate(parts):
        if p in ('PREPA','ENFERMERIA','NUTRICION','LENA','ESPECIALIDADES','MAESTRIAS','CAMPO'):
            prog = p
            try:
                diff_s = parts[-4].replace(',','').replace('+','').replace('-','')
                diff = int(diff_s)
                if '⬇' in line:
                    prog_menos[prog] = prog_menos.get(prog, 0) + diff
                else:
                    prog_mas[prog] = prog_mas.get(prog, 0) + diff
            except:
                pass
            break

print('Sistema da MENOS por programa:')
for p,v in sorted(prog_menos.items(), key=lambda x: -x[1]):
    print(f'  {p:<15} ${v:,}')
print()
print('Sistema da MÁS por programa:')
for p,v in sorted(prog_mas.items(), key=lambda x: -x[1]):
    print(f'  {p:<15} ${v:,}')
