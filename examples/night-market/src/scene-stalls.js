const { seg, eo, eob, lerp } = kit;
const STALLS = [['Noodles', 300], ['Ceramics', 810], ['Live music', 1320]];
kit.scene('stalls', {
  init(kit) {
    let h = '';
    STALLS.forEach(([w, x], i) => {
      h += '<div class="stalls-stall" style="position:absolute;left:' + x + 'px;top:430px;width:300px">' +
        '<svg width="300" height="120" viewBox="0 0 300 120" style="display:block"><path d="M0 40 L30 0 H270 L300 40 Z" fill="' + (i === 1 ? '#F2C14E' : '#E07A3F') + '"/>' +
        '<path d="M0 40 Q37.5 80 75 40 Q112.5 80 150 40 Q187.5 80 225 40 Q262.5 80 300 40 Z" fill="#F6EBDD"/></svg>' +
        '<div style="height:220px;margin:0 20px;background:color-mix(in srgb, #F6EBDD 12%, #14213D)"></div>' +
        '<div class="words" style="position:static;margin-top:28px;align-items:center"><p class="sub" style="font-size:48px;color:#F6EBDD">' + w + '</p></div></div>';
    });
    kit.stage.append(kit.h('<div class="ground">' + h + '</div>'));
    this.stalls = [...kit.stage.querySelectorAll('.stalls-stall')].map((n) => n.style);
  },
  render(t) {
    this.stalls.forEach((s, i) => {
      const k = seg(t, 0.2 + i * 0.35, 0.9 + i * 0.35);
      s.opacity = eo(seg(t, 0.2 + i * 0.35, 0.5 + i * 0.35));
      s.transform = 'translateY(' + lerp(120, 0, eob(k, 1.6)) + 'px) scale(' + lerp(1, 1.02, t / 4) + ')';
    });
  },
});
