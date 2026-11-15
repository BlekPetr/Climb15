import './styles.css';
import { syncReminder } from './reminder';
import { exercisesScreen } from './screens/exercises';
import { historyScreen } from './screens/history';
import { sessionScreen } from './screens/session';
import { settingsScreen } from './screens/settings';
import { todayScreen } from './screens/today';
import { type Cleanup, ICONS, type Screen } from './ui';

const ROUTES: Record<string, { screen: Screen; title: string; tab?: boolean; icon?: string }> = {
  today: { screen: todayScreen, title: 'Today', tab: true, icon: ICONS.today },
  exercises: { screen: exercisesScreen, title: 'Exercises', tab: true, icon: ICONS.list },
  history: { screen: historyScreen, title: 'History', tab: true, icon: ICONS.calendar },
  settings: { screen: settingsScreen, title: 'Settings', tab: true, icon: ICONS.settings },
  session: { screen: sessionScreen, title: 'Session' },
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="view" id="view" tabindex="-1"></div>
  <nav class="tabs" id="tabs" aria-label="Main">
    ${Object.entries(ROUTES)
      .filter(([, r]) => r.tab)
      .map(([id, r]) => `<a class="tab" href="#/${id}" data-route="${id}">${r.icon}<span>${r.title}</span></a>`)
      .join('')}
  </nav>`;
const view = document.getElementById('view')!;
const tabs = document.getElementById('tabs')!;

let cleanup: Cleanup | void;

function routeName(): string {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return name in ROUTES ? name : 'today';
}

function render() {
  cleanup?.();
  cleanup = undefined;
  const name = routeName();
  const route = ROUTES[name];
  document.title = name === 'today' ? 'Climb 15' : `${route.title} · Climb 15`;
  document.body.dataset.route = name;
  tabs.hidden = !route.tab;
  tabs.querySelectorAll<HTMLAnchorElement>('.tab').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  view.innerHTML = '';
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  cleanup = route.screen(view, nav);
}

function nav(hash: string) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

window.addEventListener('hashchange', render);
// Re-render Today when coming back to the app (e.g. after midnight).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && routeName() === 'today') render();
});
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => syncReminder())
      .catch(() => {});
  });
  // A notification tap on an already-open window asks us to go to Today.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open-today' && routeName() !== 'session') nav('#/today');
  });
}
