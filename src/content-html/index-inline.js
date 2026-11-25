(function(){
  /* motion: only when the visitor allows it and the browser can observe; otherwise everything shows as is.
     The head sets .motion early so the headline never flashes; this confirms or removes it. */
  var root=document.documentElement;
  var calm=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canMove=!calm && 'IntersectionObserver' in window;
  root.classList.toggle('motion',canMove);

  function once(els,fn,opts){
    if(!canMove){return;}
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){fn(e.target);io.unobserve(e.target);}});},opts||{threshold:0.3});
    els.forEach(function(el){io.observe(el);});
  }
  var all=function(sel){return Array.prototype.slice.call(document.querySelectorAll(sel));};

  /* chart draws, section heads ease in */
  once(all('.fig,[data-reveal]'),function(el){el.classList.add('in');},{threshold:0.2});

  /* figures count up from their before value, once */
  var counts=all('.num-count');
  function show(el,v){var d=(el.dataset.to.split('.')[1]||'').length;el.textContent=(el.dataset.pre||'')+v.toFixed(d)+(el.dataset.suf||'');}
  if(canMove){counts.forEach(function(el){show(el,parseFloat(el.dataset.from||0));});}
  once(counts,function(el){
    var a=parseFloat(el.dataset.from||0),b=parseFloat(el.dataset.to),t0=null;
    function step(t){if(t0===null)t0=t;var p=Math.min(1,(t-t0)/1200);p=1-Math.pow(1-p,3);show(el,a+(b-a)*p);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  },{threshold:0.6});

  /* Fig. 1 before/after slider: a real range input drives the split, so it works by mouse, touch and keyboard */
  all('[data-compare]').forEach(function(fig){
    var range=fig.querySelector('.cmp-range'),stage=fig.querySelector('.cmp-stage'),touched=false;
    if(!range||!stage){return;}
    fig.classList.add('cmp-ready');
    function set(v){stage.style.setProperty('--pos',v+'%');}
    range.addEventListener('input',function(){touched=true;set(range.value);});
    set(range.value);
    /* one slow sweep the first time it is seen, so people know it moves */
    once([fig],function(){
      var path=[50,30,70,50],i=0,t0=null;
      function step(t){
        if(touched){return;}
        if(t0===null)t0=t;var p=Math.min(1,(t-t0)/700),e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
        var v=path[i]+(path[i+1]-path[i])*e;set(v);range.value=v;
        if(p<1){requestAnimationFrame(step);}else if(++i<path.length-1){t0=null;requestAnimationFrame(step);}
      }
      setTimeout(function(){requestAnimationFrame(step);},900);
    },{threshold:0.6});
  });

  /* Where you show up: light each place on the map as its line reaches the middle of the screen */
  var steps=all('.story-step[data-i]'),chips=all('.map-chip'),links=all('.map-link'),countEl=document.querySelector('.story-n');
  if(canMove && steps.length && window.matchMedia('(min-width: 961px)').matches){
    var lit=-1;
    function light(n){
      if(n===lit){return;}lit=n;
      chips.forEach(function(c,i){c.classList.toggle('on',i<=n);});
      links.forEach(function(l,i){l.classList.toggle('on',i<=n);});
      steps.forEach(function(s,i){s.classList.toggle('on',i===n);});
      if(countEl){countEl.textContent=n+1;}
    }
    light(0);
    var sio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){light(+e.target.dataset.i);}});},{rootMargin:'-45% 0px -45% 0px'});
    steps.forEach(function(s){sio.observe(s);});
    /* past the last place, keep everything lit */
    var end=document.querySelector('.story-end');
    if(end){new IntersectionObserver(function(es){if(es[0].isIntersecting){light(steps.length-1);}},{rootMargin:'-45% 0px -45% 0px'}).observe(end);}
  } else {
    chips.forEach(function(c){c.classList.add('on');});links.forEach(function(l){l.classList.add('on');});
  }

  /* form validation feedback */
  function validateEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  var emailInput=document.getElementById('f-email'), nameInput=document.getElementById('f-name');
  if(emailInput){
    emailInput.addEventListener('input',function(){
      emailInput.classList.toggle('input-valid',validateEmail(emailInput.value));
      emailInput.classList.toggle('input-invalid',emailInput.value && !validateEmail(emailInput.value));
    });
  }
  if(nameInput){
    nameInput.addEventListener('input',function(){
      nameInput.classList.toggle('input-valid',nameInput.value.length>2);
    });
  }

  /* mobile sticky CTA: visible once the hero has scrolled away and until the form is on screen */
  var sticky=document.getElementById('stickyCta'), hero=document.querySelector('.hero'), auditSec=document.getElementById('audit');
  if(sticky && hero && auditSec && 'IntersectionObserver' in window){
    var heroGone=false, formShown=false;
    function update(){ sticky.classList.toggle('show', heroGone && !formShown); }
    new IntersectionObserver(function(es){ heroGone=!es[0].isIntersecting; update(); },{threshold:0}).observe(hero);
    new IntersectionObserver(function(es){ formShown=es[0].isIntersecting; update(); },{threshold:0.1}).observe(auditSec);
  }
})();
