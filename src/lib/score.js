// src/lib/score.js
// Calcula score de qualificação de um lead (0-100)

function calcLeadScore({ phone, email, budgetMax, source, temperature }) {
  let score = 0;
  if (phone)                    score += 20;
  if (email)                    score += 15;
  if (budgetMax && budgetMax >= 500000) score += 20;
  if (source === 'indicacao')   score += 20;
  if (temperature === 'hot')    score += 25;
  else if (temperature === 'warm') score += 15;
  return Math.min(score, 100);
}

module.exports = { calcLeadScore };
