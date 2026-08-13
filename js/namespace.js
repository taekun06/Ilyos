    window.ILYOS = window.ILYOS || {
      version: "V76",
      build: "ILYOS_V76_ANIMATION_20260813",
      yieldToMainThread: function () {
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
    };
