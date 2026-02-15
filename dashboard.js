const stats = document.getElementById('stats');
const tableBody = document.querySelector('#reposTable tbody');
const errorBox = document.getElementById('error');
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
function card(title, value) {
  const div = document.createElement('div');
  div.className = 'p-4 rounded border border-gray-700 bg-gray-800/50';
  div.innerHTML = `<div class="text-gray-300 text-sm">${title}</div><div class="text-2xl font-semibold mt-1">${value}</div>`;
  return div;
}
function fmtDate(s) {
  const d = new Date(s);
  return d.toLocaleDateString();
}
async function load() {
  try {
    const res = await fetch('https://api.github.com/users/eMortoja/repos?per_page=100&sort=updated');
    if (!res.ok) throw new Error('Failed to load repositories');
    const repos = await res.json();
    const visible = repos.filter(r => !r.fork);
    const totals = visible.reduce((a, r) => {
      a.stars += r.stargazers_count;
      a.forks += r.forks_count;
      a.issues += r.open_issues_count;
      a.repos += 1;
      return a;
    }, { stars: 0, forks: 0, issues: 0, repos: 0 });
    stats.appendChild(card('Repositories', totals.repos));
    stats.appendChild(card('Stars', totals.stars));
    stats.appendChild(card('Forks', totals.forks));
    stats.appendChild(card('Open issues', totals.issues));
    const fragment = document.createDocumentFragment();
    visible.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-700';
      tr.innerHTML = `
        <td class="p-3"><a class="hover:underline" href="${r.html_url}" target="_blank" rel="noopener">${r.name}</a></td>
        <td class="p-3">${r.stargazers_count}</td>
        <td class="p-3">${r.forks_count}</td>
        <td class="p-3">${r.open_issues_count}</td>
        <td class="p-3 text-gray-300">${fmtDate(r.pushed_at)}</td>
      `;
      fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.classList.remove('hidden');
  }
}
load();
