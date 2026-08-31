import { Router } from 'express';
import { computeAvailableHours } from '../services/availability.js';

const router = Router();

// GET /api/availability?start=YYYY-MM-DD&days=7
// Zwraca wolne godziny startowe dla `days` kolejnych dni licząc od `start`.
router.get('/', (req, res) => {
  const { start } = req.query;

  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: 'Parametr "start" musi być datą w formacie YYYY-MM-DD.' });
  }

  const numDays = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
  const startDate = new Date(`${start}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime())) {
    return res.status(400).json({ error: 'Nieprawidłowa data w parametrze "start".' });
  }

  const days = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, availableHours: computeAvailableHours(dateStr) });
  }

  res.json({ days });
});

export default router;
