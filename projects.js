const container = document.getElementById('projects');
const errorBox = document.getElementById('error');
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
async function load() {
  try {
    const res = await fetch('https://api.github.com/users/eMortoja/repos?per_page=100&sort=updated');
    if (!res.ok) throw new Error('Failed to load repositories');
    const repos = await res.json();
    const visible = repos.filter(r => !r.fork);
    const fragment = document.createDocumentFragment();
    visible.forEach(r => {
      const div = document.createElement('div');
      div.className = 'border border-gray-700 rounded p-4 bg-gray-800/50 hover:bg-gray-800 transition';
      const topics = Array.isArray(r.topics) ? r.topics.slice(0, 5) : [];
      const homepage = r.homepage && r.homepage.trim().length ? r.homepage : null;
      div.innerHTML = `
        <div class="flex items-start justify-between">
          <a class="text-lg font-semibold hover:underline" href="${r.html_url}" target="_blank" rel="noopener">${r.name}</a>
          <span class="text-xs px-2 py-1 rounded bg-gray-700">${r.private ? 'private' : 'public'}</span>
        </div>
        <p class="text-sm text-gray-300 mt-2">${r.description || 'No description'}</p>
        <div class="flex items-center gap-4 text-sm text-gray-300 mt-3">
          <span>★ ${r.stargazers_count}</span>
          <span>⑂ ${r.forks_count}</span>
          <span>● ${r.open_issues_count}</span>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          ${topics.map(t => `<span class="text-xs px-2 py-1 rounded bg-gray-700">${t}</span>`).join('')}
        </div>
        <div class="mt-4 flex gap-3">
          <a class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500" href="${r.html_url}" target="_blank" rel="noopener">Repository</a>
          ${homepage ? `<a class="px-3 py-1 rounded bg-green-600 hover:bg-green-500" href="${homepage}" target="_blank" rel="noopener">Live</a>` : ''}
        </div>
      `;
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.classList.remove('hidden');
  }
}
load();
