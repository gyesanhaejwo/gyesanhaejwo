/* 계산 로직 (브라우저 + Node 공용). 매년 1월 RATES 갱신 필요 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalcLib = factory();
})(this, function () {
  var RATES = {
    year: 2026,
    pension: 0.0475, pensionMax: 6590000, pensionMin: 410000, // 국민연금 근로자 부담 4.75%, 기준소득월액 상·하한
    health: 0.03595,   // 건강보험 근로자 부담
    ltc: 0.1314,       // 장기요양 (건강보험료 대비)
    employ: 0.009,     // 고용보험 근로자 부담
    minWage: 10320     // 2026 최저시급
  };

  var floor10 = function (n) { return Math.floor(n / 10) * 10; };

  // ---------- 연봉 실수령액 ----------
  function earnedIncomeDeduction(s) { // 근로소득공제
    var d;
    if (s <= 5000000) d = s * 0.7;
    else if (s <= 15000000) d = 3500000 + (s - 5000000) * 0.4;
    else if (s <= 45000000) d = 7500000 + (s - 15000000) * 0.15;
    else if (s <= 100000000) d = 12000000 + (s - 45000000) * 0.05;
    else d = 14750000 + (s - 100000000) * 0.02;
    return Math.min(d, 20000000);
  }
  function incomeTaxBase(b) { // 종합소득세 산출세액
    if (b <= 0) return 0;
    if (b <= 14000000) return b * 0.06;
    if (b <= 50000000) return b * 0.15 - 1260000;
    if (b <= 88000000) return b * 0.24 - 5760000;
    if (b <= 150000000) return b * 0.35 - 15440000;
    if (b <= 300000000) return b * 0.38 - 19940000;
    if (b <= 500000000) return b * 0.40 - 25940000;
    if (b <= 1000000000) return b * 0.42 - 35940000;
    return b * 0.45 - 65940000;
  }
  function earnedTaxCredit(tax, s) { // 근로소득세액공제
    var c = tax <= 1300000 ? tax * 0.55 : 715000 + (tax - 1300000) * 0.3;
    var cap;
    if (s <= 33000000) cap = 740000;
    else if (s <= 70000000) cap = Math.max(660000, 740000 - (s - 33000000) * 0.008);
    else if (s <= 120000000) cap = Math.max(500000, 660000 - (s - 70000000) * 0.5);
    else cap = Math.max(200000, 500000 - (s - 120000000) * 0.5);
    return Math.min(c, cap);
  }
  function childCredit(n) {
    if (n <= 0) return 0;
    if (n === 1) return 150000;
    if (n === 2) return 350000;
    return 350000 + (n - 2) * 300000;
  }

  // o: { gross(원, 연봉 or 월급), mode:'annual'|'monthly', nontaxMonthly(원), dependents(본인포함), children, sevIncluded }
  function salary(o) {
    var dep = Math.max(1, o.dependents || 1), kids = Math.max(0, o.children || 0);
    var monthly = o.mode === 'monthly' ? o.gross : o.gross / (o.sevIncluded ? 13 : 12);
    var nontax = Math.min(o.nontaxMonthly || 0, monthly);
    var base = Math.max(0, monthly - nontax);

    var pBase = base === 0 ? 0 : Math.min(Math.max(base, RATES.pensionMin), RATES.pensionMax);
    var pension = floor10(pBase * RATES.pension);
    var health = floor10(base * RATES.health);
    var ltc = floor10(health * RATES.ltc);
    var employ = floor10(base * RATES.employ);

    var s = base * 12;
    var taxable = Math.max(0, s - earnedIncomeDeduction(s) - 1500000 * dep - (pension + health + ltc + employ) * 12);
    var tax = incomeTaxBase(taxable);
    tax = Math.max(0, tax - earnedTaxCredit(tax, s) - childCredit(kids) - 130000); // 표준세액공제 13만원 (간이세액표 기준)
    var incomeTax = floor10(tax / 12);
    var localTax = floor10(incomeTax * 0.1);

    var insurance = pension + health + ltc + employ;
    var totalDeduct = insurance + incomeTax + localTax;
    return {
      monthly: Math.round(monthly), nontax: Math.round(nontax),
      pension: pension, health: health, ltc: ltc, employ: employ,
      incomeTax: incomeTax, localTax: localTax,
      totalDeduct: totalDeduct, net: Math.round(monthly - totalDeduct),
      annualNet: Math.round((monthly - totalDeduct) * 12)
    };
  }

  // ---------- 날짜 유틸 ----------
  function toDate(v) { if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate()); var p = String(v).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
  function addDays(d, n) { var x = toDate(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = toDate(d), day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return x; }
  function iso(d) { d = toDate(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------- 퇴직금 ----------
  // o: { join, leave, pay3(최근3개월 임금총액), bonusYear(연간 상여금), leavePayYear(연차수당) }
  function severance(o) {
    var tenure = diffDays(o.join, o.leave) + 1;
    var start3 = addMonths(addDays(o.leave, 1), -3);
    var days3 = diffDays(start3, addDays(o.leave, 1));
    var wage3 = o.pay3 + (o.bonusYear || 0) * 3 / 12 + (o.leavePayYear || 0) * 3 / 12;
    var avgDaily = wage3 / days3;
    return {
      tenure: tenure, days3: days3, avgDaily: Math.round(avgDaily),
      eligible: tenure >= 365,
      pay: Math.round(avgDaily * 30 * tenure / 365),
      years: Math.floor(tenure / 365), restDays: tenure - Math.floor(tenure / 365) * 365
    };
  }

  // ---------- 주휴수당 / 최저시급 ----------
  function weekly(o) {
    var h = o.weekHours;
    var holiday = h >= 15 ? Math.min(h, 40) / 40 * 8 : 0;
    var monthHours = (h + holiday) * 365 / 7 / 12;
    return {
      holidayHours: holiday,
      holidayPayWeek: Math.round(o.hourly * holiday),
      monthHours: Math.round(monthHours * 100) / 100,
      monthPay: Math.round(o.hourly * monthHours),
      basePayWeek: Math.round(o.hourly * h),
      belowMin: o.hourly < RATES.minWage
    };
  }

  // ---------- 대출 ----------
  // o: { amount, rate(연 %), months, type:'equal-pi'|'equal-p'|'bullet' }
  function loan(o) {
    var r = o.rate / 100 / 12, n = o.months, P = o.amount, rows = [], bal = P, totalInt = 0, i, pay, int, prin;
    if (o.type === 'equal-pi') {
      pay = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      for (i = 1; i <= n; i++) { int = bal * r; prin = pay - int; bal -= prin; totalInt += int; rows.push([i, pay, prin, int, Math.max(0, bal)]); }
    } else if (o.type === 'equal-p') {
      prin = P / n;
      for (i = 1; i <= n; i++) { int = bal * r; bal -= prin; totalInt += int; rows.push([i, prin + int, prin, int, Math.max(0, bal)]); }
    } else {
      for (i = 1; i <= n; i++) { int = P * r; totalInt += int; rows.push([i, i === n ? P + int : int, i === n ? P : 0, int, i === n ? 0 : P]); }
    }
    return { rows: rows, totalInterest: totalInt, totalPay: P + totalInt, first: rows[0] ? rows[0][1] : 0, last: rows.length ? rows[rows.length - 1][1] : 0 };
  }

  // ---------- 만 나이 ----------
  var ZODIAC = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
  function age(birth, base) {
    var b = toDate(birth), t = toDate(base);
    var y = t.getFullYear() - b.getFullYear(), m = t.getMonth() - b.getMonth(), d = t.getDate() - b.getDate();
    if (d < 0) { m--; d += new Date(t.getFullYear(), t.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    var nb = new Date(t.getFullYear(), b.getMonth(), b.getDate());
    if (nb < t) nb = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate());
    return {
      man: y, months: m, days: d,
      yeon: t.getFullYear() - b.getFullYear(), korean: t.getFullYear() - b.getFullYear() + 1,
      lived: diffDays(b, t), nextBirthday: nb, toNext: diffDays(t, nb),
      zodiac: ZODIAC[(((b.getFullYear() - 4) % 12) + 12) % 12]
    };
  }

  // ---------- 부가세 ----------
  function vat(o) { // o:{ amount, mode:'supply'|'total'|'vat'? }
    if (o.mode === 'total') { var supply = Math.round(o.amount / 1.1); return { supply: supply, vat: o.amount - supply, total: o.amount }; }
    var v = Math.round(o.amount * 0.1); return { supply: o.amount, vat: v, total: o.amount + v };
  }

  // ---------- 실업급여(구직급여) ----------
  // o: { monthly(퇴직 전 3개월 월평균 임금, 세전), age50(bool: 50세 이상 또는 장애인), years(고용보험 가입기간, 년) }
  var UI = { max: 68100, min: 66048 }; // 2026 구직급여 상·하한 (일액)
  function unemployment(o) {
    var avgDaily = o.monthly * 12 / 365;
    var raw = avgDaily * 0.6;
    var daily = Math.min(UI.max, Math.max(UI.min, raw));
    var y = o.years, d;
    if (o.age50) d = y < 1 ? 120 : y < 3 ? 180 : y < 5 ? 210 : y < 10 ? 240 : 270;
    else d = y < 1 ? 120 : y < 3 ? 150 : y < 5 ? 180 : y < 10 ? 210 : 240;
    var r = Math.round(daily);
    return { avgDaily: Math.round(avgDaily), raw: Math.round(raw), daily: r, days: d, total: r * d, month: r * 30, capped: raw > UI.max ? 'max' : raw < UI.min ? 'min' : '' };
  }

  // ---------- 프리랜서 3.3% / 종합소득세 ----------
  // o: { income(연 수입금액), expenseRate(%), dependents(본인 포함), insurance(연간 국민연금+건강보험료) }
  function freelancer(o) {
    var withheld = Math.round(o.income * 0.033);
    var profit = o.income * (1 - o.expenseRate / 100);
    var base = Math.max(0, profit - 1500000 * Math.max(1, o.dependents) - (o.insurance || 0));
    var tax = Math.max(0, incomeTaxBase(base) - 70000); // 표준세액공제 7만원
    tax = Math.floor(tax / 10) * 10;
    var local = Math.floor(tax * 0.1 / 10) * 10;
    var total = tax + local;
    return {
      withheld: withheld, tax3: Math.round(o.income * 0.03), local03: withheld - Math.round(o.income * 0.03),
      net33: Math.round(o.income - withheld),
      profit: Math.round(profit), base: Math.round(base), tax: tax, local: local, total: total,
      refund: withheld - total // +면 환급, -면 추가 납부
    };
  }

  // ---------- 셀러 마진 ----------
  // o: { price, cost, shipping, feeRate(%), adCost }
  function seller(o) {
    var fee = o.price * o.feeRate / 100;
    var before = o.price - o.cost - o.shipping - fee;
    var profit = before - (o.adCost || 0);
    return { fee: Math.round(fee), before: Math.round(before), profit: Math.round(profit),
      margin: o.price ? profit / o.price * 100 : 0, roi: o.cost ? profit / o.cost * 100 : 0,
      breakEvenRoas: before > 0 ? o.price / before * 100 : null };
  }

  // ---------- 연차 ----------
  // o: { join, base, monthlyWage(월 통상임금), unused(미사용 연차 일수) }
  function annualLeave(o) {
    var j = toDate(o.join), b = toDate(o.base);
    var yrs = b.getFullYear() - j.getFullYear();
    if (b.getMonth() < j.getMonth() || (b.getMonth() === j.getMonth() && b.getDate() < j.getDate())) yrs--;
    var months = (b.getFullYear() - j.getFullYear()) * 12 + b.getMonth() - j.getMonth() - (b.getDate() < j.getDate() ? 1 : 0);
    var days = yrs < 1 ? Math.max(0, Math.min(11, months)) : Math.min(25, 15 + Math.floor((yrs - 1) / 2));
    var dayWage = o.monthlyWage / 209 * 8;
    return { years: Math.max(0, yrs), days: days, dayWage: Math.round(dayWage), pay: Math.round(dayWage * (o.unused || 0)) };
  }

  return { RATES: RATES, UI: UI, unemployment: unemployment, freelancer: freelancer, seller: seller, annualLeave: annualLeave, salary: salary, severance: severance, weekly: weekly, loan: loan, age: age, vat: vat, diffDays: diffDays, addDays: addDays, addMonths: addMonths, toDate: toDate, iso: iso };
});
