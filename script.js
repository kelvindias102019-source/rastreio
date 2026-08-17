// ============================================================
// DADOS DO RASTREIO
// Edite este bloco para trocar código, serviço e etapas. As datas são calculadas automaticamente.
// A consulta de CEP usa o ViaCEP apenas para preencher o destino.
// ============================================================
const trackingData = {
  trackingCode: "BR123456789XX",
  serviceName: "ENTREGA PADRÃO",
  serviceShort: "PAC",
  expectedDate: "—",
  destination: "Informe um CEP para localizar o endereço",
  currentStatus: "Em trânsito",
  events: [
    {
      type: "truck",
      title: "Objeto em trânsito — por favor aguarde",
      location: "de Unidade de Tratamento em ORIGEM/UF para Unidade de Distribuição em CIDADE/UF",
      date: "—",
      details: "O objeto segue em deslocamento para a região de destino."
    },
    {
      type: "box",
      title: "Objeto chegou à unidade de tratamento",
      location: "UNIDADE DE TRATAMENTO/UF",
      date: "—",
      details: "O objeto foi recebido pela unidade responsável pela próxima etapa logística."
    },
    {
      type: "posted",
      title: "Objeto postado",
      location: "AGÊNCIA DE ORIGEM/UF",
      date: "—",
      details: "Registro inicial de postagem do objeto."
    }
  ]
};

const iconSvgs = {
  delivered: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12.5 10.5 15l6-7"/><circle cx="12" cy="12" r="9"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  posted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5V8Zm2-4h10v4H7V4Zm2 8h6"/></svg>'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  trackingForm: $("#trackingForm"),
  trackingInput: $("#trackingInput"),
  clearInputBtn: $("#clearInputBtn"),
  fieldMessage: $("#fieldMessage"),
  trackingCode: $("#trackingCode"),
  expectedDate: $("#expectedDate"),
  destination: $("#destination"),
  deliveryNotice: $("#deliveryNotice"),
  serviceName: $("#serviceName"),
  serviceSummary: $("#serviceSummary"),
  currentStatus: $("#currentStatus"),
  lastUpdate: $("#lastUpdate"),
  timeline: $("#timeline"),
  statusSummary: $("#statusSummary"),
  saveButton: $("#saveButton"),
  savedMessage: $("#savedMessage"),
  copyButton: $("#copyButton"),
  shareButton: $("#shareButton"),
  expandAllBtn: $("#expandAllBtn"),
  scrollTopBtn: $("#scrollTopBtn"),
  supportBtn: $("#supportBtn"),
  menuButton: $("#menuButton"),
  mobileMenu: $("#mobileMenu"),
  modalBackdrop: $("#modalBackdrop"),
  modalClose: $("#modalClose"),
  modalOk: $("#modalOk"),
  modalTitle: $("#modalTitle"),
  modalText: $("#modalText"),
  toast: $("#toast"),
  cepForm: $("#cepForm"),
  cepInput: $("#cepInput"),
  cepLookupButton: $("#cepLookupButton"),
  cepMessage: $("#cepMessage"),
  addressResult: $("#addressResult"),
  addressPreview: $("#addressPreview"),
  addressNumber: $("#addressNumber"),
  addressComplement: $("#addressComplement")
};

let toastTimer;
let detailsExpanded = false;
let currentCepData = null;
let cepAbortController = null;
let trackingStatusVisible = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}


// ============================================================
// DATAS DINÂMICAS DO RASTREIO
// - Previsão de entrega: sempre amanhã.
// - Evento mais recente: hoje.
// - Postagem: 1 ou 2 dias antes, de forma estável para o CEP.
// ============================================================
function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatDateBr(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateTimeBr(date, time) {
  return `${formatDateBr(date)} ${time}`;
}

function getPostingOffset(cep = "") {
  const digits = onlyDigits(cep);
  if (!digits) return 2;

  // Mantém o resultado consistente para o mesmo CEP no mesmo fluxo:
  // CEP terminado em número par -> 2 dias antes; ímpar -> 1 dia antes.
  const lastDigit = Number(digits.at(-1));
  return Number.isFinite(lastDigit) && lastDigit % 2 === 0 ? 2 : 1;
}

function updateDynamicTrackingDates(cep = "") {
  const today = startOfLocalDay();
  const tomorrow = addDays(today, 1);
  const postingOffset = getPostingOffset(cep);
  const postedDay = addDays(today, -postingOffset);

  trackingData.expectedDate = formatDateBr(tomorrow);

  // A movimentação mais recente sempre acompanha o dia da consulta.
  trackingData.events[0].date = formatDateTimeBr(today, "10:42");

  if (postingOffset === 2) {
    trackingData.events[1].date = formatDateTimeBr(addDays(today, -1), "19:18");
    trackingData.events[2].date = formatDateTimeBr(postedDay, "12:05");
  } else {
    // Quando a postagem é de ontem, a chegada à unidade fica registrada hoje,
    // antes da movimentação mais recente, mantendo a ordem cronológica.
    trackingData.events[1].date = formatDateTimeBr(today, "08:18");
    trackingData.events[2].date = formatDateTimeBr(postedDay, "12:05");
  }
}

function renderTracking(data) {
  els.trackingCode.textContent = data.trackingCode;
  els.expectedDate.textContent = data.expectedDate;
  els.destination.textContent = data.destination;
  els.serviceName.textContent = data.serviceName;
  els.serviceSummary.textContent = data.serviceShort;
  els.currentStatus.textContent = data.currentStatus;

  const latest = data.events[0]?.date || "—";
  const [date, time] = latest.split(" ");
  els.lastUpdate.textContent = time ? `${date} às ${time}` : latest;

  els.timeline.innerHTML = data.events.map((event, index) => `
    <li class="timeline-item">
      <div class="timeline-rail">
        <div class="timeline-icon">${iconSvgs[event.type] || iconSvgs.box}</div>
      </div>
      <div class="timeline-content">
        <div class="timeline-title-row">
          <h3 class="timeline-title">${escapeHtml(event.title)}</h3>
          <button class="timeline-toggle" type="button" aria-expanded="false" aria-controls="event-details-${index}" title="Ver detalhes">+</button>
        </div>
        <p class="timeline-location">${escapeHtml(event.location)}</p>
        <p class="timeline-meta">${escapeHtml(event.date)}</p>
        <div class="timeline-details" id="event-details-${index}" hidden>${escapeHtml(event.details)}</div>
      </div>
    </li>
  `).join("");

  $$(".timeline-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      target.hidden = open;
    });
  });

  updateSavedButton();
}

function setTrackingStatusVisible(visible) {
  trackingStatusVisible = Boolean(visible);
  els.timeline.hidden = !trackingStatusVisible;
  els.statusSummary.hidden = !trackingStatusVisible;
  els.expandAllBtn.hidden = !trackingStatusVisible;
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function openModal(title, text) {
  els.modalTitle.textContent = title;
  els.modalText.textContent = text;
  els.modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => els.modalOk.focus());
}

function closeModal() {
  els.modalBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function updateSavedButton() {
  const saved = JSON.parse(localStorage.getItem("trackingDemoSaved") || "[]");
  const isSaved = saved.some((item) => item.trackingCode === trackingData.trackingCode);
  els.saveButton.classList.toggle("is-saved", isSaved);
  els.saveButton.querySelector("span").textContent = isSaved ? "Objeto salvo" : "Salvar objeto";
}

function toggleSave() {
  const saved = JSON.parse(localStorage.getItem("trackingDemoSaved") || "[]");
  const index = saved.findIndex((item) => item.trackingCode === trackingData.trackingCode);

  if (index >= 0) {
    saved.splice(index, 1);
    els.savedMessage.textContent = "Objeto removido dos salvos.";
  } else {
    saved.push({
      trackingCode: trackingData.trackingCode,
      destination: trackingData.destination,
      savedAt: new Date().toISOString()
    });
    els.savedMessage.textContent = "Objeto salvo neste navegador.";
  }

  localStorage.setItem("trackingDemoSaved", JSON.stringify(saved));
  updateSavedButton();
  setTimeout(() => { els.savedMessage.textContent = ""; }, 2400);
}

function navigateTo(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  $$(".nav-link, .mobile-nav-link").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.section === sectionId));
  if (!els.mobileMenu.hidden) toggleMobileMenu(false);
}

function toggleMobileMenu(force) {
  const shouldOpen = typeof force === "boolean" ? force : els.mobileMenu.hidden;
  els.mobileMenu.hidden = !shouldOpen;
  els.menuButton.classList.toggle("is-open", shouldOpen);
  els.menuButton.setAttribute("aria-expanded", String(shouldOpen));
}

function setCepMessage(message, type = "") {
  els.cepMessage.textContent = message;
  els.cepMessage.classList.toggle("error", type === "error");
  els.cepMessage.classList.toggle("success", type === "success");
}

function buildAddressPreview(data) {
  const city = [data.localidade, data.uf].filter(Boolean).join("/");
  return [data.logradouro, data.bairro, city, `CEP ${formatCep(data.cep)}`].filter(Boolean).join(" — ");
}

function buildFullAddress(data, number, complement) {
  const firstLine = [data.logradouro || "Endereço", number].filter(Boolean).join(", ");
  const complementText = complement ? ` - ${complement}` : "";
  const city = [data.localidade, data.uf].filter(Boolean).join("/");
  return `${firstLine}${complementText} — ${[data.bairro, city, `CEP ${formatCep(data.cep)}`].filter(Boolean).join(" — ")}`;
}

function resetDestinationState() {
  updateDynamicTrackingDates(els.cepInput.value);
  trackingData.destination = "Informe um CEP para localizar o endereço";
  trackingData.currentStatus = "Em trânsito";
  trackingData.events[0].title = "Objeto em trânsito — por favor aguarde";
  trackingData.events[0].location = "de Unidade de Tratamento em ORIGEM/UF para Unidade de Distribuição em CIDADE/UF";
  trackingData.events[0].details = "O objeto segue em deslocamento para a região de destino.";
  els.deliveryNotice.textContent = "Aguardando confirmação do endereço de destino.";
  els.deliveryNotice.classList.remove("is-confirmed");
  renderTracking(trackingData);
  setTrackingStatusVisible(false);
}

function updateDestinationFromCep(data, fullAddress, confirmed = false) {
  updateDynamicTrackingDates(data.cep || els.cepInput.value);
  trackingData.destination = fullAddress;

  if (data.localidade && data.uf) {
    trackingData.events[0].location = `a caminho da Unidade de Distribuição em ${data.localidade}/${data.uf}`;
  }

  if (confirmed) {
    trackingData.currentStatus = "Em trânsito para o destino";
    trackingData.events[0].title = "Objeto em trânsito para o endereço de destino";
    trackingData.events[0].details = "O objeto segue para o endereço confirmado pelo destinatário.";
    els.deliveryNotice.textContent = "A entrega está a caminho para o endereço indicado.";
    els.deliveryNotice.classList.add("is-confirmed");
  } else {
    els.deliveryNotice.textContent = "CEP localizado. Informe o número e confirme o endereço para definir o destino.";
    els.deliveryNotice.classList.remove("is-confirmed");
  }

  renderTracking(trackingData);
  setTrackingStatusVisible(true);
}

async function lookupCep() {
  const cep = onlyDigits(els.cepInput.value);
  els.cepInput.value = formatCep(cep);

  if (cep.length !== 8) {
    currentCepData = null;
    els.addressResult.hidden = true;
    setTrackingStatusVisible(false);
    setCepMessage("Digite um CEP válido com 8 números.", "error");
    els.cepInput.focus();
    return;
  }

  if (cepAbortController) cepAbortController.abort();
  cepAbortController = new AbortController();
  const timeout = setTimeout(() => cepAbortController.abort(), 8000);

  const originalLabel = els.cepLookupButton.textContent;
  els.cepLookupButton.disabled = true;
  els.cepLookupButton.textContent = "Buscando...";
  setCepMessage("Consultando endereço...", "");

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: cepAbortController.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) throw new Error("Falha na consulta");
    const data = await response.json();

    if (data.erro) {
      currentCepData = null;
      els.addressResult.hidden = true;
      setTrackingStatusVisible(false);
      setCepMessage("CEP não encontrado. Confira os números e tente novamente.", "error");
      return;
    }

    currentCepData = data;
    const preview = buildAddressPreview(data);
    els.addressPreview.textContent = preview;
    els.addressResult.hidden = false;
    setCepMessage("Endereço localizado. Complete o número para confirmar o destino.", "success");
    updateDestinationFromCep(data, preview, false);

    setTimeout(() => els.addressNumber.focus(), 80);
  } catch (error) {
    if (error?.name === "AbortError") {
      setCepMessage("A consulta demorou demais. Tente novamente.", "error");
    } else {
      setCepMessage("Não foi possível consultar o CEP agora. Verifique sua conexão e tente novamente.", "error");
    }
  } finally {
    clearTimeout(timeout);
    els.cepLookupButton.disabled = false;
    els.cepLookupButton.textContent = originalLabel;
  }
}

function restoreConfirmedAddress() {
  try {
    const stored = JSON.parse(localStorage.getItem("trackingDemoAddress") || "null");
    if (!stored?.cepData || !stored?.fullAddress) return;

    currentCepData = stored.cepData;
    els.cepInput.value = formatCep(stored.cepData.cep);
    els.addressPreview.textContent = buildAddressPreview(stored.cepData);
    els.addressNumber.value = stored.number || "";
    els.addressComplement.value = stored.complement || "";
    els.addressResult.hidden = false;
    setCepMessage("Endereço confirmado anteriormente neste navegador.", "success");
    updateDestinationFromCep(stored.cepData, stored.fullAddress, true);
  } catch {
    localStorage.removeItem("trackingDemoAddress");
  }
}

els.trackingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = formatCode(els.trackingInput.value);
  els.trackingInput.value = code;
  els.fieldMessage.classList.remove("error");

  if (!code) {
    els.fieldMessage.textContent = "Digite um código para consultar.";
    els.fieldMessage.classList.add("error");
    els.trackingInput.focus();
    return;
  }

  if (code !== trackingData.trackingCode) {
    els.fieldMessage.textContent = "Código não encontrado. Confira o código informado.";
    els.fieldMessage.classList.add("error");
    return;
  }

  els.fieldMessage.textContent = "Objeto localizado.";
  renderTracking(trackingData);
  document.getElementById("resultArea").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => { els.fieldMessage.textContent = ""; }, 2200);
});

els.trackingInput.addEventListener("input", () => {
  els.trackingInput.value = formatCode(els.trackingInput.value);
  els.clearInputBtn.hidden = !els.trackingInput.value;
  if (els.fieldMessage.classList.contains("error")) {
    els.fieldMessage.textContent = "";
    els.fieldMessage.classList.remove("error");
  }
});

els.clearInputBtn.addEventListener("click", () => {
  els.trackingInput.value = "";
  els.clearInputBtn.hidden = true;
  els.fieldMessage.textContent = "";
  els.trackingInput.focus();
});

els.cepInput.addEventListener("input", () => {
  els.cepInput.value = formatCep(els.cepInput.value);
  currentCepData = null;
  els.addressResult.hidden = true;
  setCepMessage("");
  resetDestinationState();
});

els.cepInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupCep();
  }
});

els.cepLookupButton.addEventListener("click", lookupCep);

els.cepForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentCepData) {
    lookupCep();
    return;
  }

  const number = els.addressNumber.value.trim();
  const complement = els.addressComplement.value.trim();

  if (!number) {
    setCepMessage("Informe o número do endereço ou digite S/N.", "error");
    els.addressNumber.focus();
    return;
  }

  const fullAddress = buildFullAddress(currentCepData, number, complement);
  updateDestinationFromCep(currentCepData, fullAddress, true);
  setCepMessage("Endereço confirmado como destino da entrega.", "success");

  localStorage.setItem("trackingDemoAddress", JSON.stringify({
    cepData: currentCepData,
    number,
    complement,
    fullAddress
  }));

  showToast("Endereço de destino confirmado.");
  document.querySelector(".destination-card").scrollIntoView({ behavior: "smooth", block: "center" });
});

els.copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(trackingData.trackingCode);
    showToast("Código copiado.");
  } catch {
    showToast("Código: " + trackingData.trackingCode);
  }
});

els.shareButton.addEventListener("click", async () => {
  const shareData = {
    title: "Rastreio de encomenda",
    text: `Código de rastreamento: ${trackingData.trackingCode}`,
    url: location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      showToast("Informações de rastreio copiadas.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Não foi possível compartilhar.");
  }
});

els.saveButton.addEventListener("click", toggleSave);

els.expandAllBtn.addEventListener("click", () => {
  detailsExpanded = !detailsExpanded;
  $$(".timeline-toggle").forEach((button) => {
    button.setAttribute("aria-expanded", String(detailsExpanded));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !detailsExpanded;
  });
  els.expandAllBtn.querySelector("span").textContent = detailsExpanded ? "Ocultar detalhes das etapas" : "Ver detalhes de todas as etapas";
  els.expandAllBtn.querySelector("b").textContent = detailsExpanded ? "−" : "+";
});

els.scrollTopBtn.addEventListener("click", () => {
  document.getElementById("rastrear").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => els.trackingInput.focus(), 500);
});

function openHelp() {
  openModal(
    "Central de ajuda",
    "Digite o código de rastreamento para consultar o andamento. O campo de CEP consulta o ViaCEP para localizar rua, bairro, cidade e estado e permite confirmar o endereço de destino."
  );
}

els.supportBtn.addEventListener("click", openHelp);
$("#helpButton").addEventListener("click", openHelp);
$("#aboutFooterBtn").addEventListener("click", openHelp);
$("#aboutDemoBtn").addEventListener("click", () => openModal(
  "Sobre este portal",
  "Este é um serviço independente de acompanhamento de entregas e não possui vínculo com os Correios ou qualquer transportadora. A consulta de CEP usa o ViaCEP para localizar o endereço informado."
));

$("#savedObjectsBtn").addEventListener("click", () => {
  const saved = JSON.parse(localStorage.getItem("trackingDemoSaved") || "[]");
  if (!saved.length) {
    openModal("Objetos salvos", "Você ainda não salvou nenhum objeto neste navegador.");
    return;
  }
  openModal("Objetos salvos", `Há ${saved.length} objeto(s) salvo(s) neste navegador. Código atual: ${saved.map(x => x.trackingCode).join(", ")}.`);
});

$$(".demo-action").forEach((button) => button.addEventListener("click", () => showToast(button.dataset.message || "Opção indisponível.")));
$$(".nav-link, .mobile-nav-link").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.section)));
els.menuButton.addEventListener("click", () => toggleMobileMenu());
els.modalClose.addEventListener("click", closeModal);
els.modalOk.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (event) => { if (event.target === els.modalBackdrop) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modalBackdrop.hidden) closeModal(); });
$("#backToTopFooter").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// Atualiza o item ativo do menu de acordo com a rolagem.
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  $$(".nav-link, .mobile-nav-link").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.section === visible.target.id));
}, { rootMargin: "-25% 0px -55% 0px", threshold: [0, .15, .4] });
["rastrear", "enviar", "receber", "atendimento"].forEach((id) => sectionObserver.observe(document.getElementById(id)));

// Permite abrir o site já com ?codigo=BR123456789XX.
const params = new URLSearchParams(location.search);
const initialCode = formatCode(params.get("codigo") || "");
if (initialCode) {
  els.trackingInput.value = initialCode;
  els.clearInputBtn.hidden = false;
}

updateDynamicTrackingDates(initialCode);
renderTracking(trackingData);
setTrackingStatusVisible(false);
restoreConfirmedAddress();
