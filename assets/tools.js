/* 각 계산기 페이지의 화면 동작. <body data-tool="..."> 로 분기 */
(function () {
  var L = window.CalcLib;
  var $ = function (id) { return document.getElementById(id); };
  var won = function (n) { return Math.round(n).toLocaleString('ko-KR') + '원'; };
  var num = function (id) { return parseFloat(String($(id).value).replace(/,/g, '')) || 0; };
  var qs = new URLSearchParams(location.search);

  // 천 단위 콤마 입력
  document.querySelectorAll('input.money').forEach(function (el) {
    el.addEventListener('input', function () {
      var v = el.value.replace(/[^0-9]/g, '');
      el.value = v ? Number(v).toLocaleString('ko-KR') : '';
    });
  });

  function show(html) { var r = $('result'); r.innerHTML = html; r.classList.add('show'); }
  function big(label, value) { return '<div class="big"><small>' + label + '</small><strong>' + value + '</strong></div>'; }
  function rows(list) {
    return '<div class="tw"><table>' + list.map(function (r) {
      return '<tr' + (r[2] ? ' class="sum"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('') + '</table></div>';
  }
  function bind(fn) {
    var f = document.querySelector('form');
    f.addEventListener('submit', function (e) { e.preventDefault(); fn(); });
    f.addEventListener('change', fn);
    return fn;
  }
  function today() { return L.iso(new Date()); }

  var tools = {
    salary: function () {
      if (qs.get('v')) $('amount').value = qs.get('v');
      bind(function () {
        var amt = num('amount') * 10000;
        if (!amt) return;
        var r = L.salary({
          gross: amt, mode: $('mode').value, nontaxMonthly: num('nontax') * 10000,
          dependents: num('dep'), children: num('child'), sevIncluded: $('sev').checked
        });
        show(big('월 예상 실수령액', won(r.net)) + rows([
          ['월 급여(세전)', won(r.monthly)], ['비과세(식대 등)', won(r.nontax)],
          ['국민연금', '-' + won(r.pension)], ['건강보험', '-' + won(r.health)],
          ['장기요양보험', '-' + won(r.ltc)], ['고용보험', '-' + won(r.employ)],
          ['근로소득세', '-' + won(r.incomeTax)], ['지방소득세', '-' + won(r.localTax)],
          ['공제 합계', '-' + won(r.totalDeduct), 1], ['월 실수령액', won(r.net), 1], ['연 실수령액(12개월)', won(r.annualNet), 1]
        ]) + '<p class="note">국세청 간이세액표와 일부 차이가 있을 수 있는 예상 금액입니다. 실제 급여명세서를 기준으로 확인하세요.</p>');
      })();
    },

    severance: function () {
      $('leave').value = today();
      bind(function () {
        if (!$('join').value || !$('leave').value) return;
        var r = L.severance({
          join: $('join').value, leave: $('leave').value, pay3: num('pay3'),
          bonusYear: num('bonus'), leavePayYear: num('leavepay')
        });
        if (r.tenure <= 0) { show('<p class="warn">퇴사일이 입사일보다 앞섭니다.</p>'); return; }
        var head = r.eligible ? big('예상 퇴직금(세전)', won(r.pay))
          : '<p class="warn">재직기간이 1년(365일) 미만이라 법정 퇴직금 지급 대상이 아닙니다.</p>';
        show(head + rows([
          ['재직일수', r.tenure.toLocaleString() + '일 (' + r.years + '년 ' + r.restDays + '일)'],
          ['퇴직 전 3개월 총일수', r.days3 + '일'],
          ['1일 평균임금', won(r.avgDaily)],
          ['퇴직금 = 1일 평균임금 × 30일 × 재직일수 ÷ 365', r.eligible ? won(r.pay) : '-', 1]
        ]) + '<p class="note">세금(퇴직소득세) 공제 전 금액이며, 상여금·연차수당 등을 정확히 넣을수록 실제와 가까워집니다.</p>');
      })();
    },

    weekly: function () {
      bind(function () {
        var h = num('hourly'), w = num('hours');
        if (!h || !w) return;
        var r = L.weekly({ hourly: h, weekHours: w });
        var min = L.RATES.minWage;
        show(big('월 예상 급여(주휴수당 포함)', won(r.monthPay)) + rows([
          ['주 근로시간', w + '시간'],
          ['주휴시간', r.holidayHours ? r.holidayHours.toFixed(1) + '시간' : '해당 없음 (주 15시간 미만)'],
          ['주 기본급', won(r.basePayWeek)], ['주휴수당(주당)', won(r.holidayPayWeek)],
          ['월 환산 근로시간', r.monthHours + '시간'], ['월 예상 급여', won(r.monthPay), 1]
        ]) + (r.belowMin ? '<p class="warn">입력한 시급이 ' + L.RATES.year + '년 최저시급(' + won(min) + ')보다 낮습니다.</p>' : '<p class="note">' + L.RATES.year + '년 최저시급은 ' + won(min) + '입니다.</p>'));
      })();
    },

    loan: function () {
      bind(function () {
        var P = num('amount'), rate = num('rate'), n = num('term');
        if ($('unit').value === 'y') n *= 12;
        n = Math.round(n);
        if (!P || !n) return;
        var r = L.loan({ amount: P, rate: rate, months: n, type: $('type').value });
        var fmt = function (v) { return Math.round(v).toLocaleString('ko-KR'); };
        var first = $('type').value === 'equal-p' ? '첫 달 납입액' : '월 납입액';
        var tbl = r.rows.slice(0, 600).map(function (x) {
          return '<tr><td>' + x[0] + '회</td><td>' + fmt(x[1]) + '</td><td>' + fmt(x[2]) + '</td><td>' + fmt(x[3]) + '</td><td>' + fmt(x[4]) + '</td></tr>';
        }).join('');
        show(big(first, won(r.first)) + rows([
          ['대출 원금', won(P)], ['총 이자', won(r.totalInterest)], ['총 상환액', won(r.totalPay), 1]
        ]) + '<h3>상환 스케줄</h3><div class="tw"><table><tr><th>회차</th><th>납입액</th><th>원금</th><th>이자</th><th>잔액</th></tr>' + tbl + '</table></div>');
      })();
    },

    age: function () {
      $('base').value = today();
      bind(function () {
        if (!$('birth').value) return;
        var a = L.age($('birth').value, $('base').value);
        var nb = L.iso(a.nextBirthday);
        show(big('만 나이', a.man + '세') + rows([
          ['만 나이(법적 기준)', a.man + '세 ' + a.months + '개월 ' + a.days + '일'],
          ['연 나이(연도 차이)', a.yeon + '세'], ['세는 나이(옛 방식)', a.korean + '세'],
          ['태어난 지', a.lived.toLocaleString() + '일'],
          ['다음 생일', nb + ' (D-' + a.toNext + ')'], ['띠', a.zodiac + '띠']
        ]));
      })();
    },

    dday: function () {
      $('start').value = today();
      bind(function () {
        var s = $('start').value, e = $('end').value, n = $('plus').value;
        var html = '';
        if (s && e) {
          var d = L.diffDays(s, e), w = ['일', '월', '화', '수', '목', '금', '토'][L.toDate(e).getDay()];
          html += big(d > 0 ? 'D-' + d : d < 0 ? 'D+' + (-d) : 'D-Day', Math.abs(d).toLocaleString() + '일 ' + (d >= 0 ? '남음' : '지남')) +
            rows([['기준일', s], ['목표일', e + ' (' + w + '요일)'], ['일수 차이(당일 제외)', Math.abs(d).toLocaleString() + '일'],
              ['당일 포함', (Math.abs(d) + 1).toLocaleString() + '일'], ['주 단위', Math.floor(Math.abs(d) / 7) + '주 ' + (Math.abs(d) % 7) + '일']]);
        }
        if (s && n !== '') {
          var t = L.addDays(s, parseInt(n, 10) || 0);
          html += '<h3>기준일 ' + (parseInt(n, 10) >= 0 ? '+ ' : '- ') + Math.abs(parseInt(n, 10) || 0) + '일</h3>' +
            rows([['결과 날짜', L.iso(t) + ' (' + ['일', '월', '화', '수', '목', '금', '토'][t.getDay()] + '요일)']]);
        }
        if (html) show(html);
      })();
    },

    unemployment: function () {
      bind(function () {
        var m = num('monthly');
        if (!m) return;
        var r = L.unemployment({ monthly: m, age50: $('age50').value === '1', years: num('years') });
        var note = r.capped === 'max' ? '상한액이 적용되었습니다.' : r.capped === 'min' ? '하한액이 적용되었습니다.' : '평균임금의 60%가 그대로 적용되었습니다.';
        show(big('1일 구직급여(실업급여)', won(r.daily)) + rows([
          ['1일 평균임금', won(r.avgDaily)], ['평균임금의 60%', won(r.raw)], ['적용 일액 (' + note + ')', won(r.daily)],
          ['소정급여일수', r.days + '일'], ['한 달(30일) 수령액', won(r.month)], ['총 예상 수령액', won(r.total), 1]
        ]) + '<p class="note">수급 자격(비자발적 퇴사, 180일 이상 근무 등)을 충족해야 받을 수 있습니다. 상·하한액은 ' + won(L.UI.max) + ' / ' + won(L.UI.min) + '(' + L.RATES.year + '년) 기준입니다.</p>');
      })();
    },

    freelancer: function () {
      bind(function () {
        var inc = num('income');
        if (!inc) return;
        var r = L.freelancer({ income: inc, expenseRate: num('rate'), dependents: num('dep'), insurance: num('ins') });
        var refund = r.refund >= 0;
        show(big(refund ? '예상 환급액' : '예상 추가 납부액', won(Math.abs(r.refund))) +
          '<h3>① 3.3% 원천징수</h3>' + rows([
            ['수입금액', won(inc)], ['소득세 3%', '-' + won(r.tax3)], ['지방소득세 0.3%', '-' + won(r.local03)],
            ['실제 입금액', won(r.net33), 1]]) +
          '<h3>② 5월 종합소득세 신고 시 (추정)</h3>' + rows([
            ['소득금액(수입−경비)', won(r.profit)], ['과세표준', won(r.base)], ['종합소득세', won(r.tax)], ['지방소득세', won(r.local)],
            ['총 납부세액', won(r.total), 1], ['이미 낸 3.3%', won(r.withheld)],
            [refund ? '환급 예상' : '추가 납부 예상', won(Math.abs(r.refund)), 1]]) +
          '<p class="note">경비율은 업종별 단순경비율·기준경비율 또는 실제 경비로 달라집니다. 본인 경비율을 직접 입력하세요. 예상치이므로 홈택스 모의계산으로 최종 확인하세요.</p>');
      })();
    },

    seller: function () {
      bind(function () {
        var p = num('price');
        if (!p) return;
        var r = L.seller({ price: p, cost: num('cost'), shipping: num('ship'), feeRate: num('fee'), adCost: num('ad') });
        show(big('개당 예상 순이익', won(r.profit)) + rows([
          ['판매가', won(p)], ['상품 원가', '-' + won(num('cost'))], ['배송비(판매자 부담)', '-' + won(num('ship'))],
          ['판매 수수료', '-' + won(r.fee)], ['광고비', '-' + won(num('ad'))], ['순이익', won(r.profit), 1],
          ['마진율(판매가 대비)', r.margin.toFixed(1) + '%'], ['투자수익률(원가 대비)', r.roi.toFixed(1) + '%'],
          ['손익분기 ROAS', r.breakEvenRoas ? r.breakEvenRoas.toFixed(0) + '%' : '계산 불가(광고 전 이미 적자)']
        ]) + (r.profit < 0 ? '<p class="warn">이 조건에서는 개당 적자입니다.</p>' : '') + '<p class="note">수수료율은 판매 채널·카테고리·결제수단에 따라 다릅니다. 본인 수수료율을 입력하세요. 부가세는 계산에 포함하지 않았습니다.</p>');
      })();
    },

    leave: function () {
      $('base').value = today();
      bind(function () {
        if (!$('join').value) return;
        var r = L.annualLeave({ join: $('join').value, base: $('base').value, monthlyWage: num('wage'), unused: num('unused') });
        show(big('발생 연차', r.days + '일') + rows([
          ['근속 연수', r.years + '년'], ['기준일까지 발생한 연차', r.days + '일'],
          ['1일 통상임금 (월 통상임금 ÷ 209 × 8)', won(r.dayWage)], ['미사용 연차', num('unused') + '일'],
          ['예상 연차수당', won(r.pay), 1]
        ]) + '<p class="note">출근율 80% 이상을 가정한 값입니다. 회사 취업규칙에 따라 회계연도 기준으로 계산하는 경우 결과가 다를 수 있습니다.</p>');
      })();
    },

    vat: function () {
      bind(function () {
        var a = num('amount');
        if (!a) return;
        var r = L.vat({ amount: a, mode: $('mode').value });
        show(big('합계금액(부가세 포함)', won(r.total)) + rows([
          ['공급가액', won(r.supply)], ['부가세(10%)', won(r.vat)], ['합계', won(r.total), 1]
        ]));
      })();
    }
  };

  var t = document.body.getAttribute('data-tool');
  if (tools[t]) tools[t]();
})();
