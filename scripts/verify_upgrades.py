"""Upgrade real published packages in place and preserve existing native workspaces."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
import venv
ROOT=Path(__file__).resolve().parents[1]
VERSION=tomllib.loads((ROOT/"apps/agent/pyproject.toml").read_text())["project"]["version"]
PYTHON_CONSUMER=r'''import json,sys
from pathlib import Path
from fastapi import FastAPI,Header,HTTPException
from fastapi.testclient import TestClient
from relay_backend import install_relay,__version__
app=FastAPI(title="Upgrade consumer")
@app.get("/me")
def me(authorization:str|None=Header(default=None)):
    if authorization!="Bearer user-secret": raise HTTPException(401,"User required")
    return {"role":"user"}
@app.get("/admin")
def admin(authorization:str|None=Header(default=None)):
    if authorization!="Bearer admin-secret": raise HTTPException(403,"Admin required")
    return {"role":"admin"}
install_relay(app,db_path=Path("workspace.sqlite3"),project=None)
with TestClient(app,base_url="http://localhost:9876",client=("127.0.0.1",1234)) as client:
    assert client.get("/relay/").status_code==200
    h={"Origin":"http://localhost:9876","X-Relay-CSRF":client.get("/relay/__relay/health").json()["csrf_token"]}
    snapshot=client.post("/relay/__relay/sources/inspect",headers=h).json()
    endpoint=next(e for e in snapshot["endpoints"] if e["id"]=="GET /me")
    if sys.argv[1]=="seed":
        assert client.post("/relay/__relay/endpoints/update",headers=h,json={"endpoint_id":endpoint["id"],"fingerprint":endpoint["fingerprint"],"progress":"in_progress","note":"Keep my local note"}).status_code==200
    state=client.get("/relay/__relay/workspace").json()["endpoints"]["GET /me"]
    assert state["progress"]=="in_progress" and state["note"]=="Keep my local note"
    for path,token,status in [("/me","user-secret",200),("/admin","user-secret",403),("/admin","admin-secret",200)]:
        result=client.post("/relay/__relay/execute",headers=h,json={"method":"GET","path":path,"headers":{"Authorization":"Bearer "+token}})
        assert result.status_code==200 and result.json()["status"]==status
    assert client.get("/relay/brand/relay-symbol.svg").status_code==200
assert __version__==sys.argv[2],__version__
if sys.argv[1]!="seed":
    import relay_agent,relay_team.app
    assert relay_agent.install_relay is install_relay
    assert "site-packages" in str(Path(relay_team.app.__file__))
print("Python "+__version__+": native discovery, auth, execution, branding and existing status/note passed.")
'''
NODE_CONSUMER=r'''const assert=require('node:assert/strict'),http=require('node:http');
const {relay,version}=require('relay-backend');
const schema={openapi:'3.0.3',info:{title:'Upgrade consumer',version:'1'},paths:{'/me':{get:{responses:{200:{description:'OK'}}}},'/admin':{get:{responses:{200:{description:'OK'}}}}}};
const middleware=relay({openapi:schema,project:false,dataDir:process.cwd()+'/node-data'});
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/relay')) return middleware(req,res);
 res.setHeader('Content-Type','application/json');
 const expected=req.url==='/admin'?'admin-secret':'user-secret';
 res.statusCode=req.headers.authorization==='Bearer '+expected?200:403;
 res.end(JSON.stringify({role:expected}));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,body){const headers=body?{'Content-Type':'application/json',Origin:base,'X-Relay-CSRF':csrf}:{};const response=await fetch(base+'/relay/__relay/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});assert.equal(response.status,200);return response.json();}
 let csrf=(await request('health')).csrf_token;
 const snapshot=await request('sources/inspect',{}),endpoint=snapshot.endpoints.find(e=>e.id==='GET /me');
 if(process.argv[2]==='seed') await request('endpoints/update',{endpoint_id:endpoint.id,fingerprint:endpoint.fingerprint,progress:'in_progress',note:'Keep my local note'});
 const row=(await request('workspace')).endpoints['GET /me'];
 assert.equal(row.progress,'in_progress');assert.equal(row.note,'Keep my local note');
 for(const [path,token,status] of [['/me','user-secret',200],['/admin','user-secret',403],['/admin','admin-secret',200]]) assert.equal((await request('execute',{method:'GET',path,headers:{Authorization:'Bearer '+token}})).status,status);
 assert.equal((await fetch(base+'/relay/')).status,200);
 assert.equal((await fetch(base+'/relay/brand/relay-symbol.svg')).status,200);
 assert.equal(version,process.argv[3]);
 console.log('Node '+version+': native discovery, auth, execution, branding and existing status/note passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await middleware.close();server.close();server.closeAllConnections();});
'''

def main():
    with tempfile.TemporaryDirectory(prefix="relay-upgrade-") as temporary:
        folder=Path(temporary)
        environment=dict(os.environ)
        for key in ("PYTHONPATH","RELAY_TEAM_URL","RELAY_TEAM_PROJECT","RELAY_TEAM_TOKEN"): environment.pop(key,None)
        venv.EnvBuilder(with_pip=True).create(folder/"env")
        python=folder/"env"/("Scripts/python.exe" if os.name=="nt" else "bin/python")
        def run(command): subprocess.run([str(a) for a in command],cwd=folder,env=environment,check=True)
        run([python,"-m","pip","install","relay-backend==0.0.4","--index-url","https://pypi.org/simple"])
        (folder/"consumer.py").write_text(PYTHON_CONSUMER)
        run([python,"consumer.py","seed","0.0.4"])
        run([python,"-m","pip","install",str(ROOT/"dist"/f"relay_backend-{VERSION}-py3-none-any.whl")+"[realtime]"])
        run([python,"consumer.py","verify",VERSION])
        run([python,"-m","relay_backend","team","init","--help"])
        node=shutil.which("node"); assert node
        npm_cli=Path(node).parent/"node_modules/npm/bin/npm-cli.js"
        npm=[node,str(npm_cli)] if npm_cli.exists() else [shutil.which("npm")]
        (folder/"package.json").write_text('{"name":"relay-upgrade-consumer","private":true}')
        (folder/"consumer.cjs").write_text(NODE_CONSUMER)
        run([*npm,"install","relay-backend@0.0.3","--ignore-scripts","--no-audit","--no-fund"])
        run([node,"consumer.cjs","seed","0.0.3"])
        run([*npm,"install",ROOT/"dist"/f"relay-backend-{VERSION}.tgz","--ignore-scripts","--no-audit","--no-fund"])
        run([node,"consumer.cjs","verify",VERSION])
        print("Published Python 0.0.4 and npm 0.0.3 upgraded in place without integration edits or workspace loss.")
if __name__=="__main__": main()
