(function(){
  if (window.__pathfinder_widget_loaded__) return; window.__pathfinder_widget_loaded__=true;
  var btn = document.createElement('button');
  btn.textContent = 'Ask';
  btn.style.position='fixed'; btn.style.right='16px'; btn.style.bottom='16px'; btn.style.zIndex='99999';
  btn.style.background='#111'; btn.style.color='#fff'; btn.style.borderRadius='999px'; btn.style.padding='10px 14px'; btn.style.border='none'; btn.style.boxShadow='0 2px 8px rgba(0,0,0,.2)';
  document.body.appendChild(btn);

  var modal, input, results;
  function open(){
    if(!modal){
      modal=document.createElement('div');
      modal.style.position='fixed'; modal.style.inset='0'; modal.style.background='rgba(0,0,0,.4)'; modal.style.zIndex='100000';
      var panel=document.createElement('div');
      panel.style.position='absolute'; panel.style.left='50%'; panel.style.top='20%'; panel.style.transform='translateX(-50%)'; panel.style.background='#fff'; panel.style.borderRadius='12px'; panel.style.width='min(640px, 90vw)'; panel.style.padding='16px'; panel.style.boxShadow='0 10px 30px rgba(0,0,0,.3)';
      var h=document.createElement('div'); h.textContent='Pathfinder'; h.style.fontWeight='700'; h.style.marginBottom='8px'; panel.appendChild(h);
      input=document.createElement('input'); input.type='text'; input.placeholder='Ask a question about this site...'; input.style.width='100%'; input.style.border='1px solid #ddd'; input.style.borderRadius='8px'; input.style.padding='10px'; panel.appendChild(input);
      var go=document.createElement('button'); go.textContent='Search'; go.style.marginTop='8px'; go.style.background='#111'; go.style.color='#fff'; go.style.border='none'; go.style.borderRadius='8px'; go.style.padding='8px 12px'; panel.appendChild(go);
      results=document.createElement('div'); results.style.marginTop='12px'; results.style.maxHeight='50vh'; results.style.overflow='auto'; panel.appendChild(results);
      modal.appendChild(panel);
      modal.addEventListener('click', function(e){ if(e.target===modal) close(); });
      go.addEventListener('click', query);
      input.addEventListener('keydown', function(e){ if(e.key==='Enter') query(); });
      document.body.appendChild(modal);
    }
    modal.style.display='block'; input.focus();
  }
  function close(){ if(modal) modal.style.display='none'; }
  btn.addEventListener('click', open);

  async function query(){
    var siteId = document.documentElement.getAttribute('data-pathfinder-site');
    if(!siteId){ results.textContent='Missing site id'; return; }
    var question = input.value.trim(); if(!question){ return; }
    results.textContent='Loading...';
    try{
      var base = window.PATHFINDER_BASE_URL || (window.location.origin);
      var res = await fetch(base + '/api/query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ siteId: siteId, question: question }) });
      var data = await res.json();
      results.innerHTML='';
      if(data.answer){
        var ans=document.createElement('div');
        ans.textContent=data.answer;
        ans.style.padding='8px 6px';
        results.appendChild(ans);
      }
      (data.sources || []).forEach(function(row){
        var item=document.createElement('div'); item.style.padding='8px 6px'; item.style.borderTop='1px solid #eee';
        var a=document.createElement('a'); a.href=row.url; a.textContent=row.title || row.url; a.style.fontWeight='600'; a.style.display='block'; a.addEventListener('click', function(e){ e.preventDefault(); window.location=row.url; }); item.appendChild(a);
        if(row.snippet){ var p=document.createElement('div'); p.textContent=row.snippet; p.style.fontSize='12px'; p.style.color='#444'; item.appendChild(p); }
        if(row.screenshotUrl){ var img=document.createElement('img'); img.src=row.screenshotUrl; img.style.width='100%'; img.style.borderRadius='8px'; img.loading='lazy'; item.appendChild(img); }
        results.appendChild(item);
      });
    }catch(err){ results.textContent='Error: '+ err.message; }
  }
})();


