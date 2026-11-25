(function(){
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
