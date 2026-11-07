const groupGrids = [...document.querySelectorAll(".menu-grid[data-group]")];
const groupSections = [...document.querySelectorAll(".age-group[data-group]")];
const groupLinks = [...document.querySelectorAll(".group-nav [data-group-link]")];

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCard(card, index) {
  const icon = card.icon || "🎮";
  return `
    <a class="game-card ${escapeHtml(card.theme || "")}" href="${escapeHtml(card.href)}" style="--card-i:${index}">
      <span class="card-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <strong>${escapeHtml(card.title)}</strong>
      <span class="card-blurb">${escapeHtml(card.description)}</span>
    </a>
  `;
}

function renderGroups(cards) {
  groupGrids.forEach((grid) => {
    const groupCards = cards.filter((card) => card.group === grid.dataset.group);
    grid.innerHTML = groupCards.length
      ? groupCards.map(renderCard).join("")
      : "<p class=\"menu-error\">这个分组暂时还没有可展示的游戏。</p>";
  });
}

function renderLoadError() {
  groupGrids.forEach((grid) => {
    grid.innerHTML = "<p class=\"menu-error\">游戏列表加载失败，请检查网络后刷新页面。</p>";
  });
}

function setActiveGroup(groupId) {
  groupLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.groupLink === groupId);
  });
}

function bindGroupNav() {
  if (!groupLinks.length || !groupSections.length) {
    return;
  }

  setActiveGroup(groupSections[0].dataset.group);

  groupLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setActiveGroup(link.dataset.groupLink);
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.dataset?.group) {
        setActiveGroup(visible.target.dataset.group);
      }
    },
    {
      rootMargin: "-28% 0px -48% 0px",
      threshold: [0.15, 0.35, 0.55],
    },
  );

  groupSections.forEach((section) => observer.observe(section));
}

async function bootstrap() {
  bindGroupNav();
  try {
    const response = await fetch("./configs/game-manifest.json");
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.status}`);
    }
    const data = await response.json();
    renderGroups(Array.isArray(data.cards) ? data.cards : []);
  } catch (error) {
    console.error(error);
    renderLoadError();
  }
}

bootstrap();
