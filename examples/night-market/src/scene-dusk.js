const { seg, eo, eob, eio, lerp, TextFx } = kit;
const LAMPS = [[300, 250, 1.0], [520, 300, 0.9], [740, 330, 1.1], [960, 340, 1.0], [1180, 330, 0.95], [1400, 300, 1.05], [1620, 250, 0.9]];
kit.scene('dusk', {
  init(kit) {
    let g = '';
    LAMPS.forEach(([x, y, s], i) => {
      g += '<g class="dusk-lamp" style="transform-origin:' + x + 'px ' + (y - 40) + 'px">' +
        '<line class="cord" x1="' + x + '" y1="' + (y - 40) + '" x2="' + x + '" y2="' + (y - 10) + '"/>' +
        '<ellipse class="' + (i % 2 ? 'lantern-hi' : 'lantern') + '" cx="' + x + '" cy="' + (y + 30 * s) + '" rx="' + 38 * s + '" ry="' + 46 * s + '"/>' +
        '<rect class="lantern-hi" x="' + (x - 16) + '" y="' + (y - 14) + '" width="32" height="10" rx="3"/></g>';
    });
    kit.stage.append(kit.h('<div class="ground">' +
      '<svg class="art" viewBox="0 0 1920 1080"><path class="cord dusk-wire" d="M180 200 Q960 420 1740 200"/>' + g + '</svg>' +
      '<div class="words" style="left:160px;top:560px;width:1500px"><h1 class="line">Night Market</h1>' +
      '<p class="sub dusk-sub">Saturdays on the old pier, from dusk</p></div></div>'));
    this.lamps = [...kit.stage.querySelectorAll('.dusk-lamp')].map((n) => n.style);
    this.line = kit.stage.querySelector('.line');
    this.sub = kit.stage.querySelector('.dusk-sub').style;
    this.root = kit.stage.firstElementChild.style;
  },
  render(t) {
    this.root.transform = 'scale(' + lerp(1, 1.025, t / 4.5) + ')';
    this.lamps.forEach((s, i) => {
      const k = seg(t, 0.15 + i * 0.11, 0.85 + i * 0.11);
      s.transform = 'translateY(' + lerp(-90, 0, eob(k, 1.5)) + 'px) rotate(' + Math.sin(t * 1.9 + i) * 2.5 * eo(k) + 'deg)';
    });
    TextFx.fadeFromRight(this.line, t, 1.2);
    this.sub.opacity = eo(seg(t, 1.9, 2.4));
  },
});
