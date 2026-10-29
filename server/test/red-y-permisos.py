"""Prueba aislada de acceso LAN, primera cuenta y permisos. Solo SQLite temporal."""
import json, os, pathlib, socket, sqlite3, subprocess, tempfile, time, urllib.request, urllib.error
from urllib.parse import urlencode
root = pathlib.Path(__file__).resolve().parents[1]
sock = socket.socket(); sock.bind(('127.0.0.1',0)); port = sock.getsockname()[1]; sock.close()
# Una interfaz no-loopback prueba que la configuración de primera vez no se
# habilita remotamente, aunque la petición venga desde una red privada.
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('192.0.2.1', 80)); host_lan = s.getsockname()[0]
finally: s.close()
if host_lan.startswith('127.'):
    raise RuntimeError('Se necesita una interfaz IPv4 privada para probar el acceso LAN')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='sgf-lan-test-') as data:
    env = dict(os.environ, DB_TYPE='sqlite', HOST='0.0.0.0', PORT=str(port), SGF_DATA_DIR=data,
        JWT_SECRET='secreto-solo-para-pruebas-123456', SGF_CONSOLE_TOKEN='token-consola-ci-1234567890')
    p = subprocess.Popen(['node', str(root/'dist/index.js')], cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    def call(path, method='GET', body=None, headers=None, host='127.0.0.1'):
        request = urllib.request.Request(f'http://{host}:{port}{path}', method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type':'application/json', **(headers or {})})
        try:
            with opener.open(request, timeout=5) as response: return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error: return error.code, json.loads(error.read())
    def expect(status, result):
        assert result[0] == status, (status, result[0], result[1].get('error'))
        return result[1].get('data')
    try:
        for _ in range(100):
            try:
                if call('/api/health')[0] == 200: break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('El servidor no arrancó')
        setup = {'username':'administrador_ci','name':'Administrador ficticio','password':' para-pruebas-123 '}
        expect(403, call('/api/setup/admin','POST',setup,host=host_lan))
        expect(403, call('/api/setup/admin','POST',setup))
        expect(403, call('/api/db/config',host=host_lan))
        token = expect(201, call('/api/setup/admin','POST',setup,{'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}))['token']
        adm={'Authorization':'Bearer '+token}
        # El asistente guarda los espacios literalmente; el login debe aceptar
        # el mismo valor y rechazar una variante sin ellos.
        token = expect(200, call('/api/auth/login','POST',{'username':'administrador_ci','password':' para-pruebas-123 '},host=host_lan))['token']
        adm={'Authorization':'Bearer '+token}
        expect(401, call('/api/auth/login','POST',{'username':'administrador_ci','password':'para-pruebas-123'},host=host_lan))
        expect(403, call('/api/panel/estado',headers={'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']},host=host_lan))
        expect(409, call('/api/setup/admin','POST',setup,{'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}))
        user = expect(201, call('/api/users','POST',{'username':'operador_ci','name':'Operador ficticio','password':'para-pruebas-123','role':'usuario'},adm,host=host_lan))
        uid = user['id']
        # La copia debe incluir los cambios recién hechos, sin esperar el guardado diferido.
        copia = expect(200, call('/api/panel/copia', 'POST', {}, {**adm, 'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}))
        with sqlite3.connect(os.path.join(data, copia['archivo'])) as bd_copia:
            assert bd_copia.execute("SELECT COUNT(*) FROM SGF_USUARIOS WHERE USERNAME='operador_ci'").fetchone()[0] == 1
        login = expect(200, call('/api/auth/login','POST',{'username':'operador_ci','password':'para-pruebas-123'},host=host_lan))
        assert login['user']['permisos'] == []
        usr={'Authorization':'Bearer '+login['token']}
        expect(403,call('/api/users','GET',headers=usr,host=host_lan))
        expect(403,call('/api/users','POST',setup,usr,host=host_lan))
        expect(403,call('/api/lineas?q=555',headers=usr,host=host_lan))
        expect(403,call('/api/lineas/catalogo',headers=usr,host=host_lan))
        expect(403,call('/api/facturas/stats',headers=usr,host=host_lan))
        expect(403,call('/api/inicio/resumen',headers=usr,host=host_lan))
        resumen = expect(200,call('/api/inicio/resumen',headers=adm,host=host_lan))
        assert resumen['usuarios'] == 2 and resumen['facturas'] == 0
        expect(403,call('/api/estadisticas/meses',headers=usr,host=host_lan))
        expect(403,call('/api/import/tables',headers=usr,host=host_lan))
        expect(403,call('/api/facturas/123','DELETE',headers=usr,host=host_lan))
        expect(403,call('/api/db/config',headers={**usr, 'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}))
        expect(200,call('/api/users/'+uid,'PUT',{'permisos':['ver_estadisticas','importar_excel','editar_facturas']},adm))
        # El servidor consulta permisos actuales en cada petición, sin esperar a otro login.
        expect(200,call('/api/estadisticas/meses',headers=usr,host=host_lan))
        expect(200,call('/api/import/tables',headers=usr,host=host_lan))
        expect(200,call('/api/lineas/catalogo',headers=usr,host=host_lan))
        actual = expect(200,call('/api/auth/me',headers=usr,host=host_lan))
        assert set(actual['permisos']) == {'ver_estadisticas','importar_excel','editar_facturas'}
        assert call('/api/facturas/123','DELETE',headers=usr,host=host_lan)[0] != 403
        expect(403,call('/api/users','GET',headers=usr,host=host_lan))
        expect(200,call('/api/users/'+uid,'PUT',{'permisos':['importar_excel']},adm))
        expect(403,call('/api/import/excel?table=SGF_FACTURAS&truncate=true','POST',{},usr,host=host_lan))
        expect(403,call('/api/import/excel?table=SGF_SERVICIOS','POST',{},usr,host=host_lan))
        expect(200,call('/api/users/'+uid,'PUT',{'permisos':[]},adm))
        expect(403,call('/api/estadisticas/meses',headers=usr,host=host_lan))
        expect(403,call('/api/import/tables',headers=usr,host=host_lan))
        expect(403,call('/api/users/'+uid,'PUT',{'permisos':['administrar_usuarios']},usr,host=host_lan))
        expect(403,call('/api/panel/apagar','POST',{}, {'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}, host=host_lan))
        expect(403,call('/api/panel/apagar','POST',{}))
        expect(200,call('/api/panel/apagar','POST',{}, {'x-sgf-console-token':env['SGF_CONSOLE_TOKEN']}))
        p.wait(timeout=12)
        assert p.returncode == 0
        with sqlite3.connect(os.path.join(data, 'sgf-data.db')) as bd_final:
            assert bd_final.execute("SELECT COUNT(*) FROM SGF_USUARIOS WHERE USERNAME='operador_ci'").fetchone()[0] == 1
        print('OK: LAN, alta inicial, permisos, copia y cierre ordenado con datos conservados.')
    finally:
        if p.poll() is None: p.terminate()
        try: p.communicate(timeout=10)
        except subprocess.TimeoutExpired: p.kill(); p.communicate()
