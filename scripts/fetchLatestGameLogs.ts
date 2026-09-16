import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs, doc, getDoc } from 'firebase/firestore';

function loadEnv() {
  const envPath = path.resolve('.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const publicGroup = collectionGroup(db, 'public');
  const snap = await getDocs(publicGroup);

  const rooms: any[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const parts = d.ref.path.split('/');
    const roomId = parts[1];
    rooms.push({ roomId, path: d.ref.path, data });
  });

  rooms.sort((a, b) => (b.data.lastUpdated || 0) - (a.data.lastUpdated || 0));

  console.log(`Всего комнат в Firestore: ${rooms.length}`);
  for (const r of rooms) {
    const logList = r.data.logs || r.data.actionLogs || [];
    const logCount = logList.length;
    const dateStr = r.data.lastUpdated ? new Date(r.data.lastUpdated).toLocaleString('ru-RU') : 'N/A';
    console.log(`- Комната [${r.roomId}]: статус=${r.data.status}, фаза=${r.data.phase}, логов=${logCount}, обновлена=${dateStr}, победитель=${r.data.winner || '-'}`);
  }

  // Находим самую последнюю комнату, в которой реально шла игра (есть логи или статус PLAYING / GAME_OVER)
  const playedRooms = rooms.filter(r => ((r.data.logs || r.data.actionLogs) && (r.data.logs || r.data.actionLogs).length > 0) || r.data.status === 'PLAYING' || r.data.status === 'GAME_OVER');

  if (playedRooms.length === 0) {
    console.log('Не найдено сыгранных партий.');
    process.exit(0);
  }

  const latestPlayed = playedRooms[0];
  const stationLogs = latestPlayed.data.logs || latestPlayed.data.actionLogs || [];

  console.log('\n======================================================');
  console.log(`🎯 ПОСЛЕДНЯЯ СЫГРАННАЯ ПАРТИЯ: Комната ${latestPlayed.roomId}`);
  console.log(`📅 Дата/время: ${latestPlayed.data.lastUpdated ? new Date(latestPlayed.data.lastUpdated).toLocaleString('ru-RU') : 'N/A'}`);
  console.log(`⚡ Статус: ${latestPlayed.data.status} | Фаза: ${latestPlayed.data.phase} | Раунд: ${latestPlayed.data.roundNumber || 1}`);
  console.log(`🏆 Победитель: ${latestPlayed.data.winner || 'Игра продолжается / не завершена'}`);
  if (latestPlayed.data.winningRoleReason) {
    console.log(`Причина победы: ${latestPlayed.data.winningRoleReason}`);
  }

  console.log('\n👥 Участники экспедиции:');
  for (const p of (latestPlayed.data.players || [])) {
    console.log(`  - [Место ${p.seatIndex}] ${p.name} (id: ${p.id}, карт: ${p.handCount}, статус: ${p.isDead ? '💀 МЁРТВ' : 'живой'}, бот: ${p.isBot ? 'ДА' : 'НЕТ'})`);
  }

  console.log(`\n📜 ОБЩИЙ ЖУРНАЛ СТАНЦИИ (${stationLogs.length} записей):`);
  for (const log of stationLogs) {
    const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('ru-RU') : '';
    console.log(`  [${time}] [${log.type || 'INFO'}] ${log.text || log.message}`);
  }

  console.log('\n👤 ЛИЧНЫЕ ДОСЬЕ ИГРОКОВ:');
  for (const p of (latestPlayed.data.players || [])) {
    try {
      const privSnap = await getDoc(doc(db, 'rooms', latestPlayed.roomId, 'private', p.id));
      if (privSnap.exists()) {
        const priv = privSnap.data();
        console.log(`\n  --- 📂 Досье: ${p.name} (Роль: ${priv.role || 'HUMAN'}) ---`);
        console.log(`  Карты в руке: ${(priv.cards || []).map((c: any) => `«${c.name}»`).join(', ') || 'пусто'}`);
        if (priv.privateLogs && Array.isArray(priv.privateLogs) && priv.privateLogs.length > 0) {
          console.log(`  Секретные записи (${priv.privateLogs.length}):`);
          priv.privateLogs.forEach((pl: any) => {
            const t = pl.timestamp ? new Date(pl.timestamp).toLocaleTimeString('ru-RU') : '';
            console.log(`    [${t}] ${pl.text || pl.message}`);
          });
        } else {
          console.log('    (Личных записей нет)');
        }
      }
    } catch (e: any) {
      console.log(`  Не удалось получить досье ${p.name}: ${e.message}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
