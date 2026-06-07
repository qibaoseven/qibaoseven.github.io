let selectedClassId = null;
const API_BASE = '/api';

async function loadClasses() {
    try {
        const res = await fetch(`${API_BASE}/classes`);
        if(!res.ok) throw new Error();
        const classes = await res.json();
        const container = document.getElementById('classSlider');
        if(!container) return;
        if(classes.length===0){ container.innerHTML='<div style="text-align:center;color:#ff8f4e;padding:40px;">暂无班级，请创建或导入</div>'; return; }
        container.innerHTML = classes.map(cls=>`<div class="class-card" data-id="${cls.id}" onclick="selectClass('${cls.id}')"><div class="class-icon">🏫</div><div class="class-name">${escapeHtml(cls.name)}</div><div class="class-date">创建于 ${new Date(cls.created_at).toLocaleDateString()}</div></div>`).join('');
    } catch(e){ console.error(e); document.getElementById('classSlider').innerHTML='<div style="text-align:center;color:#ff4e4e;">加载失败</div>'; }
}

function selectClass(id){ selectedClassId=id; document.querySelectorAll('.class-card').forEach(c=>{ if(c.dataset.id===id) c.classList.add('selected'); else c.classList.remove('selected'); }); }

async function enterClass(){
    const pwd=document.getElementById('classPassword').value;
    if(!selectedClassId){ alert('请选择班级'); return; }
    if(!pwd){ alert('请输入密码'); return; }
    try{
        const res=await fetch(`${API_BASE}/class/${selectedClassId}`,{ headers:{'X-Password':pwd} });
        if(res.status===401){ alert('密码错误'); return; }
        if(!res.ok) throw new Error();
        const result=await res.json();
        window.appData=result.data;
        window.currentClassId=selectedClassId;
        window.classPassword=pwd;
        document.getElementById('classSelectScreen').style.display='none';
        document.getElementById('loginScreen').style.display='block';
        window.auth.renderUserSelect();
        if(window.autoSaveInterval) clearInterval(window.autoSaveInterval);
        window.autoSaveInterval=setInterval(()=>{ if(window.saveAllDataToCloud) window.saveAllDataToCloud(); },30000);
    } catch(e){ alert('加载失败'); }
}

function showImportModal(){
    window.modal.show('从JsonBin导入', `<input type="text" id="importClassName" placeholder="班级名" class="password-input"><input type="password" id="importClassPassword" placeholder="班级密码" class="password-input"><input type="text" id="importBinId" placeholder="Bin ID" class="password-input"><input type="password" id="importMasterKey" placeholder="Master Key" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'导入',onclick:'handleImport',className:'btn-primary'}]);
}

async function handleImport(){
    const name=document.getElementById('importClassName').value, pwd=document.getElementById('importClassPassword').value, binId=document.getElementById('importBinId').value, key=document.getElementById('importMasterKey').value;
    if(!name||!pwd||!binId||!key){ alert('请填写完整'); return; }
    window.modal.close();
    try{
        const res=await fetch(`${API_BASE}/classes/import`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({bin_id:binId, master_key:key, class_name:name, class_password:pwd}) });
        const result=await res.json();
        if(res.status===401){ alert('JsonBin验证失败'); return; }
        if(!res.ok) throw new Error(result.error);
        alert('导入成功');
        await loadClasses();
        selectClass(result.id);
        document.getElementById('classPassword').value=pwd;
    } catch(e){ alert('导入失败'); }
}

function showCreateModal(){
    window.modal.show('创建班级', `<input type="text" id="createClassName" placeholder="班级名" class="password-input"><input type="password" id="createClassPassword" placeholder="班级密码" class="password-input"><input type="text" id="createToken" placeholder="CLASS-TOKEN-XXXXXX" class="password-input"><button class="btn btn-primary" onclick="downloadTemplate()">📥 下载模板</button><textarea id="createJsonData" class="large-textarea" placeholder='{"users":{},"scores":{}}'></textarea>`, [{text:'取消',onclick:'window.modal.close'},{text:'创建',onclick:'handleCreate',className:'btn-primary'}]);
}

function downloadTemplate(){ window.open(`${API_BASE}/template`,'_blank'); }

async function handleCreate(){
    const name=document.getElementById('createClassName').value, pwd=document.getElementById('createClassPassword').value, token=document.getElementById('createToken').value, json=document.getElementById('createJsonData').value;
    if(!name||!pwd||!token){ alert('请填写完整'); return; }
    let parsed; try{ parsed=JSON.parse(json); }catch(e){ alert('JSON格式错误'); return; }
    if(!confirm(`确认创建班级：${name}？`)) return;
    window.modal.close();
    try{
        const res=await fetch(`${API_BASE}/classes/create`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({class_name:name, class_password:pwd, token, json_data:JSON.stringify(parsed)}) });
        const result=await res.json();
        if(res.status===401){ alert('Token无效'); return; }
        if(!res.ok) throw new Error(result.error);
        alert('创建成功');
        await loadClasses();
        selectClass(result.id);
        document.getElementById('classPassword').value=pwd;
    } catch(e){ alert('创建失败'); }
}

function escapeHtml(str){ if(!str) return ''; return str.replace(/[&<>]/g, m=>{ if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m; }); }

document.addEventListener('DOMContentLoaded',()=>{
    loadClasses();
    document.getElementById('enterClassBtn').onclick=enterClass;
    document.getElementById('importFromJsonBinBtn').onclick=showImportModal;
    document.getElementById('createEmptyClassBtn').onclick=showCreateModal;
});
