const { seg, eo, lerp, TextFx } = kit;
kit.scene('come', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="words" style="left:160px;top:380px;width:1600px">' +
      '<h2 class="line">Come hungry.</h2><p class="sub come-sub">Opening night: 3 May, 6 pm till late</p></div></div>'));
    this.line = kit.stage.querySelector('.line');
    this.sub = kit.stage.querySelector('.come-sub').style;
    this.root = kit.stage.firstElementChild.style;
  },
  render(t) {
    this.root.transform = 'scale(' + lerp(1, 1.02, t / 4) + ')';
    TextFx.fadeFromRight(this.line, t, 0.2);
    this.sub.opacity = eo(seg(t, 0.9, 1.4));
  },
});
