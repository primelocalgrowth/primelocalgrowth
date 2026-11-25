(function(){
  /* motion: only when the visitor allows it and the browser can observe; otherwise everything shows as is */
  var calm=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!calm && 'IntersectionObserver' in window){
    document.documentElement.classList.add('motion');
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:0.35});
    document.querySelectorAll('.fig,.ledger').forEach(function(el){io.observe(el);});
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
