(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rv = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
    },{threshold:.15});
    rv.forEach(function(el){ io.observe(el); });
  } else { rv.forEach(function(el){ el.classList.add('in'); }); }

  function animateCount(el){
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = el.getAttribute('data-decimal') ? 1 : 0;
    if(reduce){ el.textContent = target.toFixed(dec); return; }
    var start = parseFloat(el.textContent)||0, t0=null, dur=900;
    function tick(t){ if(!t0)t0=t; var p=Math.min((t-t0)/dur,1); p=1-Math.pow(1-p,3);
      el.textContent=(start+(target-start)*p).toFixed(dec);
      if(p<1)requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }
  var counters=document.querySelectorAll('[data-count]');
  if('IntersectionObserver' in window){
    var io2=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){animateCount(e.target);io2.unobserve(e.target);}});},{threshold:.6});
    counters.forEach(function(c){io2.observe(c);});
  } else { counters.forEach(animateCount); }

  /* hero simulator, counts to the latest client-reported review total (80) */
  var sim=document.getElementById('sim'), rev=document.getElementById('revCount'),
      status=document.getElementById('simStatus'), badge=document.getElementById('simBadge');
  function runSim(){
    if(reduce){ rev.textContent='80'; sim.classList.add('play'); status.textContent='top of the map'; badge.classList.add('on'); return; }
    rev.textContent='0';
    var n=0, iv=setInterval(function(){
      n+= n<20?2:3; if(n>=80){n=80;clearInterval(iv);
        status.textContent='climbing…';
        setTimeout(function(){ sim.classList.add('play');
          status.textContent='top of the map'; badge.classList.add('on');
        },500);
      }
      rev.textContent=n;
    },60);
  }
  setTimeout(runSim, reduce?0:700);

  /* growth chart draw on scroll */
  var chart=document.getElementById('growthChart');
  if(chart){
    if(reduce){ chart.classList.add('play'); }
    else if('IntersectionObserver' in window){
      var io3=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){chart.classList.add('play');io3.unobserve(chart);}});},{threshold:.5});
      io3.observe(chart);
    } else { chart.classList.add('play'); }
  }

  /* form validation feedback */
  var emailInput=document.getElementById('f-email'), nameInput=document.getElementById('f-name');
  function validateEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
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

  /* scroll reveal animation for .rv elements */
  if('IntersectionObserver' in window && !reduce){
    var style=document.createElement('style');
    style.textContent='.rv{opacity:0;transform:translateY(16px)}.rv.in{animation:revealIn .6s cubic-bezier(.22,1,.36,1) forwards}@keyframes revealIn{to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  /* mobile sticky CTA */
  var sticky=document.getElementById('stickyCta'), hero=document.querySelector('.hero'), auditSec=document.getElementById('audit');
  function onScroll(){
    var past = window.scrollY > hero.offsetHeight;
    var atForm = auditSec.getBoundingClientRect().top < window.innerHeight;
    sticky.classList.toggle('show', past && !atForm);
  }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
})();