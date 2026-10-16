#!/usr/bin/env node
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";

const USER = process.env.GH_USER || "0xFMD";
const TOKEN = process.env.STATS_TOKEN || process.env.GITHUB_TOKEN;
const THEME = process.env.THEME || "auto";
const ROOT = new URL("../", import.meta.url);

const PALETTES = {
  light: {
    card: "#ffffff",
    line: "#d0d7de",
    text: "#1f2328",
    muted: "#59636e",
    faint: "#6e7781",
    accent: "#1a7f37",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
  dark: {
    card: "#0d1117",
    line: "#30363d",
    text: "#e6edf3",
    muted: "#9198a1",
    faint: "#7d8590",
    accent: "#3fb950",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  },
};

const MONO = `'JetBrains Mono','SF Mono','Cascadia Code',Menlo,Consolas,'DejaVu Sans Mono',monospace`;
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,'DejaVu Sans',sans-serif`;

const ICONS = {
  graph:
    "M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z",
  pr: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
};

const W = 840,
  PAD = 5;
const INNER = W - PAD * 2;
const TILE = W / 4;
const SPACE = 0.5;
const share = (n) => ((99.6 - SPACE * (n - 1)) / n).toFixed(2) + "%";

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-stats",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors)
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  return json.data;
}

async function fetchHistory(createdAt) {
  const now = new Date().toISOString();
  const years = [];
  for (
    let y = new Date(createdAt).getUTCFullYear();
    y <= new Date().getUTCFullYear();
    y++
  )
    years.push(y);
  const slices = years
    .map(
      (
        y,
      ) => `y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y === years.at(-1) ? now : `${y}-12-31T23:59:59Z`}"){
      contributionCalendar{ weeks{ contributionDays{ contributionCount date } } }
    }`,
    )
    .join("\n");
  const data = (
    await gql(`query($login:String!){ user(login:$login){ ${slices} } }`, {
      login: USER,
    })
  ).user;

  const byDate = new Map();
  for (const year of Object.values(data))
    for (const week of year.contributionCalendar.weeks)
      for (const day of week.contributionDays)
        byDate.set(
          day.date,
          Math.max(byDate.get(day.date) ?? 0, day.contributionCount),
        );
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, contributionCount]) => ({ date, contributionCount }));
}

async function fetchExternalPRs() {
  const byOwner = new Map();
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const { user } = await gql(
      `query($login:String!, $after:String){
      user(login:$login){ pullRequests(states:MERGED, first:100, after:$after){
        pageInfo{ hasNextPage endCursor }
        nodes{ repository{ name isPrivate stargazerCount owner{ login __typename } } }
      } }
    }`,
      { login: USER, after: cursor },
    );
    for (const pr of user.pullRequests.nodes) {
      const r = pr.repository;
      if (
        !r ||
        r.isPrivate ||
        r.owner.login.toLowerCase() === USER.toLowerCase()
      )
        continue;
      const entry = byOwner.get(r.owner.login) ?? {
        owner: r.owner.login,
        isOrg: r.owner.__typename === "Organization",
        repos: new Map(),
        prs: 0,
      };
      entry.prs++;
      entry.repos.set(r.name, r.stargazerCount);
      byOwner.set(r.owner.login, entry);
    }
    if (!user.pullRequests.pageInfo.hasNextPage) break;
    cursor = user.pullRequests.pageInfo.endCursor;
  }
  return [...byOwner.values()].map((e) => ({
    owner: e.owner,
    isOrg: e.isOrg,
    prs: e.prs,
    repos: [...e.repos].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    stars: [...e.repos.values()].reduce((sum, n) => sum + n, 0),
  }));
}

async function fetchData() {
  const { user } = await gql(
    `query($login:String!){
    user(login:$login){
      login createdAt
      pullRequests{totalCount}
      repositories(ownerAffiliations:OWNER, isFork:false, first:100){
        totalCount
        nodes{ stargazerCount }
      }
      contributionsCollection{
        contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date weekday } } }
      }
    }
  }`,
    { login: USER },
  );

  const history = await fetchHistory(user.createdAt);
  const external = await fetchExternalPRs();
  return {
    login: user.login,
    totalContributions: history.reduce(
      (sum, day) => sum + day.contributionCount,
      0,
    ),
    prs: user.pullRequests.totalCount,
    repos: user.repositories.totalCount,
    stars: user.repositories.nodes.reduce(
      (sum, r) => sum + r.stargazerCount,
      0,
    ),
    calendar: user.contributionsCollection.contributionCalendar,
    history,
    external: external
      .sort((a, b) => b.stars - a.stars || b.prs - a.prs)
      .slice(0, 4),
  };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (n) => n.toLocaleString("en-US");
const fmt = (n) =>
  n >= 10000
    ? (n / 1000).toFixed(0) + "k"
    : n >= 1000
      ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
      : String(n);
const clip = (s, max) =>
  s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
const fit = (s, px, size) =>
  clip(s, Math.max(4, Math.floor(px / (size * 0.56))));

const rules = (p) =>
  `.bg{fill:${p.card};stroke:${p.line}}.ln{stroke:${p.line}}` +
  `.t{fill:${p.text}}.m{fill:${p.muted}}.f{fill:${p.faint}}.a{fill:${p.accent}}` +
  p.levels.map((c, i) => `.h${i}{fill:${c}}`).join("");

const STYLE =
  `
  .label{font-family:${SANS};font-size:12.5px;font-weight:500}
  .small{font-family:${SANS};font-size:10.5px}
  .sans{font-family:${SANS}} .mono{font-family:${MONO}}
  ${rules(PALETTES[THEME === "dark" ? "dark" : "light"])}` +
  (THEME === "auto"
    ? `\n  @media (prefers-color-scheme:dark){${rules(PALETTES.dark)}}`
    : "");

function card(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${STYLE}
</style>
<rect class="bg" x="${PAD + 0.5}" y="0.5" width="${w - PAD * 2 - 1}" height="${h - 1}" rx="6"/>
<g transform="translate(${PAD} 0)">${body}</g>
</svg>`;
}
const label = (x, y, s) =>
  `<text x="${x}" y="${y}" class="label m">${esc(s)}</text>`;

function stat(name, value, icon) {
  const w = TILE - PAD * 2;
  return card(
    TILE,
    92,
    `
  ${label(20, 32, name)}
  <g class="m" transform="translate(${w - 36} 19)"><path d="${ICONS[icon]}"/></g>
  <text x="20" y="74" class="sans t" font-size="28" font-weight="600">${esc(value)}</text>`,
  );
}

function longestStreak(days) {
  let best = 0,
    run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function contributions(d) {
  const weeks = d.calendar.weeks.slice(-53);
  const days = weeks.flatMap((w) => w.contributionDays);
  const active = days
    .map((x) => x.contributionCount)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const quartile = (f) =>
    active.length
      ? active[Math.min(active.length - 1, Math.floor(active.length * f))]
      : 1;
  const [q1, q2, q3] = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const level = (n) =>
    n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4;

  const cell = 11,
    step = 14,
    gridY = 70,
    gridW = weeks.length * step - 3;
  const gx = Math.round((INNER - gridW) / 2 + 12);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let body =
    label(20, 30, "Contributions") +
    `<text x="${INNER - 20}" y="30" class="sans m" font-size="12" text-anchor="end"><tspan class="t" font-weight="600">${num(d.calendar.totalContributions)}</tspan> in the last year</text>`;
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = new Date(week.contributionDays[0].date + "T00:00:00Z");
    const month = first.getUTCMonth();
    if (month !== lastMonth && wi < weeks.length - 2) {
      if (lastMonth !== -1 || first.getUTCDate() <= 7)
        body += `<text x="${gx + wi * step}" y="${gridY - 9}" class="small f">${months[month]}</text>`;
      lastMonth = month;
    }
    for (const day of week.contributionDays)
      body += `<rect class="h${level(day.contributionCount)}" x="${gx + wi * step}" y="${gridY + day.weekday * step}" width="${cell}" height="${cell}" rx="2"><title>${day.contributionCount} on ${day.date}</title></rect>`;
  });
  ["Mon", "Wed", "Fri"].forEach(
    (s, i) =>
      (body += `<text x="${gx - 9}" y="${gridY + (i * 2 + 1) * step + 9}" class="small f" text-anchor="end">${s}</text>`),
  );

  const ly = gridY + 7 * step + 18;
  const lx = gx + gridW - 5 * step + 3 - 34;
  body += `<text x="${lx - 8}" y="${ly + 9}" class="small f" text-anchor="end">Less</text>`;
  PALETTES.light.levels.forEach(
    (_, i) =>
      (body += `<rect class="h${i}" x="${lx + i * step}" y="${ly}" width="${cell}" height="${cell}" rx="2"/>`),
  );
  body += `<text x="${lx + 5 * step + 5}" y="${ly + 9}" class="small f">More</text>`;
  const streak = longestStreak(d.history);
  body += `<text x="${gx}" y="${ly + 9}" class="sans m" font-size="12">Longest streak <tspan class="t" font-weight="600">${streak} day${streak === 1 ? "" : "s"}</tspan> <tspan class="f">all time</tspan></text>`;
  return [body, ly + 20];
}

function prCard(r, outer) {
  const w = outer - PAD * 2;
  const textW = w - 20 - 92;
  return card(
    outer,
    86,
    `
  <text x="20" y="34" class="mono t" font-size="14" font-weight="700">${esc(fit(r.owner, textW, 14))}</text>
  <text x="20" y="56" class="sans m" font-size="12">${esc(fit(r.repos.join(" · "), textW, 12))}</text>
  <text x="20" y="76" class="small f">★ ${fmt(r.stars)}</text>
  <text x="${w - 20}" y="50" class="mono a" font-size="28" font-weight="700" text-anchor="end">${r.prs}</text>
  <text x="${w - 20}" y="68" class="small f" text-anchor="end">merged</text>`,
  );
}

function build(d) {
  const u = d.login,
    cards = [];
  const q = (s) => encodeURIComponent(s).replace(/%20/g, "+");
  const search = (s) => `https://github.com/search?q=${q(s)}&type=pullrequests`;
  const add = (file, draw, width, alt, href) => {
    cards.push([file, draw]);
    const img = `<img src="assets/${file}" width="${width}" alt="${esc(alt)}">`;
    return href ? `<a href="${href}">${img}</a>` : img;
  };
  const row = (items) => `<p align="center">\n${items.join("\n")}\n</p>`;

  const L = [
    row([
      add(
        "stat-contributions.svg",
        () => stat("Contributions", num(d.totalContributions), "graph"),
        share(4),
        `${d.totalContributions} contributions all time`,
        `https://github.com/${u}`,
      ),
      add(
        "stat-prs.svg",
        () => stat("Pull requests", num(d.prs), "pr"),
        share(4),
        `${d.prs} pull requests all time`,
        `${search(`is:pr author:${u}`)}&s=created&o=desc`,
      ),
      add(
        "stat-repos.svg",
        () => stat("Repositories", num(d.repos), "repo"),
        share(4),
        `${d.repos} repositories owned`,
        `https://github.com/${u}?tab=repositories`,
      ),
      add(
        "stat-stars.svg",
        () => stat("Stars", num(d.stars), "star"),
        share(4),
        `${d.stars} stars across all repos`,
        `https://github.com/${u}?tab=repositories&sort=stargazers`,
      ),
    ]),
  ];
  L.push(
    row([
      add(
        "contributions.svg",
        () => {
          const [body, h] = contributions(d);
          return card(W, h, body);
        },
        share(1),
        "Contribution graph",
        `https://github.com/${u}`,
      ),
    ]),
  );

  if (d.external.length) {
    const cols = d.external.length >= 4 ? 2 : d.external.length;
    const outer = W / cols;
    for (let i = 0; i < d.external.length; i += cols) {
      L.push(
        row(
          d.external
            .slice(i, i + cols)
            .map((r, j) =>
              add(
                `pr-${i + j}.svg`,
                () => prCard(r, outer),
                share(cols),
                `${r.prs} merged pull request${r.prs === 1 ? "" : "s"} in ${r.owner}`,
                search(
                  `is:pr author:${u} is:merged ${r.isOrg ? "org" : "user"}:${r.owner}`,
                ),
              ),
            ),
        ),
      );
    }
  }
  return { cards, markdown: L.join("\n\n") };
}

if (!TOKEN) {
  console.error(
    "Set STATS_TOKEN to a classic token with `repo` and `read:user`.",
  );
  process.exit(1);
}
const data = await fetchData();
const { cards, markdown } = build(data);

const dir = new URL("assets/", ROOT);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
for (const [file, draw] of cards) await writeFile(new URL(file, dir), draw());

const template = await readFile(new URL("README.template.md", ROOT), "utf8");
const [before, after = ""] = template.split("{{STATS}}");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").trim();
const readme =
  [
    "<!-- Generated from README.template.md. Edit that file instead. -->",
    strip(before),
    markdown,
    strip(after),
  ]
    .filter(Boolean)
    .join("\n\n") + "\n";
await writeFile(new URL("README.md", ROOT), readme);
console.log(
  `Wrote ${cards.length} cards and README.md for ${data.login} (theme: ${THEME})`,
);
