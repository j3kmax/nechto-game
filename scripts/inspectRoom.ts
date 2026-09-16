import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

function loadEnv() {
  const envPath = path.resolve('.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

async function main() {
  const db = getFirestore(app);
  const roomId = '3SXEML';
  const snap = await getDoc(doc(db, 'rooms', roomId, 'public', 'state'));
  if (!snap.exists()) {
    console.log('Комната не найдена');
    return;
  }

  const data = snap.data();
  console.log(`================================================================`);
  console.log(`🎮 КОМНАТА: ${roomId}`);
  console.log(`📅 Дата обновления: ${new Date(data.lastUpdated).toLocaleString('ru-RU')}`);
  console.log(`⚡ Статус: ${data.status} | Фаза: ${data.phase} | Раунд: ${data.roundNumber}`);
  console.log(`🧭 Направление: ${data.direction === 1 ? 'По часовой стрелке ↻' : 'Против часовой ↺'}`);
  console.log(`🃏 Оставшихся карт в колоде: ${data.deckCount} | В сбросе: ${data.discardPile?.length || 0}`);
  console.log(`🚪 Двери: ${JSON.stringify(data.doors || [])}`);

  console.log(`\n👥 Игроки за столом:`);
  for (const p of data.players) {
    console.log(`  - [Место ${p.seatIndex}] ${p.name} (id: ${p.id})`);
    console.log(`    Карт в руке: ${p.handCount} | Статус: ${p.isDead ? '💀 МЁРТВ' : 'живой'} | Карантин: ${p.quarantineTurns} ходов`);
  }

  // Приватные руки и роли
  console.log(`\n🔐 СЕКРЕТНЫЕ ДАННЫЕ И РУКИ ИГРОКОВ:`);
  for (const p of data.players) {
    const privSnap = await getDoc(doc(db, 'rooms', roomId, 'private', p.id));
    if (privSnap.exists()) {
      const priv = privSnap.data();
      console.log(`\n  --- 👤 ${p.name} [Роль: ${priv.role}] ---`);
      console.log(`  Карты: ${(priv.cards || []).map((c: any) => `«${c.name}» (${c.code})`).join(', ') || 'нет карт'}`);
      if (priv.privateLogs && Array.isArray(priv.privateLogs) && priv.privateLogs.length > 0) {
        console.log(`  Личный журнал досье:`);
        priv.privateLogs.forEach((pl: any) => {
          const t = pl.timestamp ? new Date(pl.timestamp).toLocaleTimeString('ru-RU') : '';
          console.log(`    [${t}] ${pl.message || pl.text}`);
        });
      }
    }
  }

  // Метаданные обмена
  const metaSnap = await getDoc(doc(db, 'rooms', roomId, 'private', '_game_meta'));
  if (metaSnap.exists()) {
    const meta = metaSnap.data();
    console.log(`\n📦 МЕТАДАННЫЕ ОБМЕНА:`);
    console.log(`  Оставшаяся колода: ${meta.fullDrawDeck?.length || 0} карт`);
    if (meta.offeredExchangeCard) {
      console.log(`  Предложенная карта для обмена:`);
      console.log(`    От кого: ${meta.offeredExchangeCard.fromPlayerId}`);
      console.log(`    Кому: ${meta.offeredExchangeCard.targetPlayerId}`);
      console.log(`    Карта: «${meta.offeredExchangeCard.card?.name}» (${meta.offeredExchangeCard.card?.code})`);
    } else {
      console.log(`  Предложенная карта для обмена: нет`);
    }
    if (meta.forcedExchangeTargetId) {
      console.log(`  Принудительная цель обмена (Соблазн): ${meta.forcedExchangeTargetId}`);
    }
  }

  // Полный журнал станции
  console.log(`\n================================================================`);
  console.log(`📜 ПОЛНЫЙ ЖУРНАЛ ДЕЙСТВИЙ СТАНЦИИ (${data.logs?.length || 0} записей):`);
  console.log(`================================================================`);
  if (data.logs && Array.isArray(data.logs)) {
    data.logs.forEach((log: any, idx: number) => {
      const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('ru-RU') : '';
      console.log(`${String(idx + 1).padStart(2, ' ')}. [${time}] [${log.type || 'INFO'}] ${log.text || log.message}`);
    });
  }

  process.exit(0);
}
main();
