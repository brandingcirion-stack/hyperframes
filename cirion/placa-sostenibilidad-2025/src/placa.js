// Contenido ES/EN/PT y línea de tiempo de la placa. index.html registra el resultado
// en window.__timelines (la raíz se crea pausada; la placa se monta tras la intro).
window.createPlacaTimeline = function createPlacaTimeline() {
  // ---------- Contenido por idioma (cifras idénticas en los tres) ----------
  const COPY = {
    es: {
      title: "Infraestructura digital que crece con responsabilidad",
      subtitle: "Informe de Sostenibilidad 2025",
      labels: [
        "menos emisiones totales",
        "energía renovable en data centers de 4\u00a0países",
        "data centers",
      ],
      body: "Conectamos personas, empresas y oportunidades mediante infraestructura crítica diseñada para promover crecimiento sostenible e innovación.",
    },
    en: {
      title: "Digital infrastructure that grows responsibly",
      subtitle: "2025 Sustainability Report",
      labels: [
        "lower total emissions",
        "renewable energy in data centers across 4\u00a0countries",
        "data centers",
      ],
      body: "We connect people, businesses and opportunities through critical infrastructure designed to drive sustainable growth and innovation.",
    },
    pt: {
      title: "Infraestrutura digital que cresce com responsabilidade",
      subtitle: "Relatório de Sustentabilidade 2025",
      labels: [
        "menos emissões totais",
        "energia renovável em data centers de 4\u00a0países",
        "data centers",
      ],
      body: "Conectamos pessoas, empresas e oportunidades por meio de infraestrutura crítica projetada para promover crescimento sustentável e inovação.",
    },
  };
  const STATS = [
    { value: 11, suffix: "%" },
    { value: 100, suffix: "%" },
    { value: 20, suffix: "" },
  ];

  const vars = window.__hyperframes?.getVariables?.() ?? {};
  const lang = COPY[vars.lang] ? vars.lang : "es";
  const copy = COPY[lang];
  document.documentElement.lang = lang;

  const splitWords = (el, text) => {
    el.textContent = "";
    text.split(" ").forEach((word, i, arr) => {
      const span = document.createElement("span");
      span.className = "w";
      span.textContent = word;
      el.appendChild(span);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
    return el.querySelectorAll(".w");
  };

  const titleWords = splitWords(document.getElementById("title"), copy.title);
  const bodyWords = splitWords(document.getElementById("body"), copy.body);
  document.getElementById("subtitle").textContent = copy.subtitle;
  copy.labels.forEach((t, i) => {
    document.getElementById(`label-${i + 1}`).textContent = t;
  });

  // ---------- Timeline (120 BPM: un pulso cada 0,5 s) ----------
  // La placa se arma en su propia línea de tiempo (0 = inicio de la placa)
  // y se monta en la raíz después de la intro.
  const INTRO = 3;
  const tl = gsap.timeline({ paused: true });
  const placa = gsap.timeline();

  // Fondo: revelado izquierda → derecha (sigue el flujo de la onda) + avance lento continuo
  placa.fromTo(
    "#bg-reveal",
    { "--reveal": "-8%" },
    { "--reveal": "100%", duration: 2.4, ease: "power2.out" },
    0,
  );
  placa.set("#bg-img", { opacity: 0.45, scale: 1.02, y: 150, transformOrigin: "50% 50%" }, 0);
  placa.to("#bg-img", { opacity: 1, duration: 2.0, ease: "power1.out" }, 0);
  placa.to("#bg-img", { scale: 1.11, duration: 4.4, ease: "none" }, 0);
  // 4,5 s: la imagen sube y se oscurece para dar paso a las cifras
  placa.to("#bg-img", { y: 40, scale: 1.18, duration: 1.1, ease: "power3.inOut" }, 4.4);
  placa.to("#bg-img", { scale: 1.26, duration: 9.5, ease: "none" }, 5.5);
  placa.to("#bg-dim", { opacity: 0.5, duration: 1.1, ease: "power2.inOut" }, 4.4);
  placa.to("#bg-foot", { opacity: 1, duration: 1.2, ease: "power2.inOut" }, 9.2);

  // Logo oficial arriba a la izquierda
  placa.fromTo(
    "#logo",
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
    0.15,
  );

  // Titular: cascada de palabras
  placa.fromTo(
    titleWords,
    { y: 34, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.07 },
    0.3,
  );
  placa.fromTo(
    "#subtitle",
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
    1.3,
  );

  // Red: la línea se traza y el pulso recorre los tres nodos
  placa.fromTo("#net-line", { scaleX: 0 }, { scaleX: 1, duration: 4.0, ease: "none" }, 4.6);
  placa.fromTo(
    ".card",
    { y: 30, opacity: 0 },
    { y: 0, opacity: 0.55, duration: 0.5, ease: "power3.out", stagger: 0.12 },
    4.5,
  );
  placa.set("#pulse", { x: 0, opacity: 0 }, 0);
  placa.to("#pulse", { opacity: 1, duration: 0.2 }, 4.6);
  // Llega a cada nodo en 5,0 / 6,5 / 8,0 s (centros: 228 / 540 / 852 px)
  placa.to("#pulse", { x: 228, duration: 0.4, ease: "power1.in" }, 4.6);
  placa.to("#pulse", { x: 540, duration: 1.5, ease: "sine.inOut" }, 5.0);
  placa.to("#pulse", { x: 852, duration: 1.5, ease: "sine.inOut" }, 6.5);
  placa.to("#pulse", { x: 1100, duration: 0.9, ease: "power1.in" }, 8.0);
  placa.to("#pulse", { opacity: 0, duration: 0.3 }, 8.6);

  const hits = [5.0, 6.5, 8.0];
  STATS.forEach((s, i) => {
    const n = i + 1;
    const at = hits[i];
    const card = `#card-${n}`;
    const numEl = document.getElementById(`num-${n}`);
    placa.to(card, { opacity: 1, duration: 0.3, ease: "power2.out" }, at);
    placa.fromTo(
      numEl,
      { opacity: 0, scale: 0.92 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" },
      at,
    );
    placa.fromTo(
      `${card} .node`,
      { scale: 1 },
      { scale: 1.9, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 },
      at,
    );
    placa.fromTo(
      `${card} .card-glow`,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power2.out" },
      at,
    );
    placa.to(
      `${card} .card-glow`,
      { opacity: 0.35, duration: 0.8, ease: "power2.inOut" },
      at + 0.5,
    );
    const counter = { v: 0 };
    placa.fromTo(
      counter,
      { v: 0 },
      {
        v: s.value,
        duration: 1.1,
        ease: "power2.out",
        onUpdate: () => {
          numEl.textContent = `${Math.round(counter.v)}${s.suffix}`;
        },
      },
      at,
    );
    placa.fromTo(
      `#label-${n}`,
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
      at + 0.15,
    );
  });

  // Cierre: texto institucional en cascada
  placa.fromTo(
    bodyWords,
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, ease: "power3.out", stagger: 0.03 },
    10.0,
  );

  // Segundo recorrido del pulso: confirma la red completa antes del final
  placa.set("#pulse", { x: 0 }, 12.0);
  placa.to("#pulse", { opacity: 0.85, duration: 0.2 }, 12.0);
  placa.to("#pulse", { x: 1100, duration: 1.8, ease: "none" }, 12.0);
  placa.to("#pulse", { opacity: 0, duration: 0.3 }, 13.5);
  [12.37, 12.88, 13.39].forEach((t, i) => {
    placa.fromTo(
      `#card-${i + 1} .card-glow`,
      { opacity: 0.35 },
      { opacity: 0.9, duration: 0.2, ease: "power2.out", yoyo: true, repeat: 1 },
      t,
    );
  });

  // Intro de marca 0–3 s; se funde a negro en sus últimos frames
  tl.fromTo(
    "#intro",
    { opacity: 1 },
    { opacity: 0, duration: 0.2, ease: "power1.in" },
    INTRO - 0.2,
  );
  tl.add(placa, INTRO);

  return tl;
};
