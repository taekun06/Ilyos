    window.ILYOS = window.ILYOS || {
      version: "V75.1",
      build: "ILYOS_V75_1_STABLE_NETLIFY_20260808",
      yieldToMainThread: function () {
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
    };
