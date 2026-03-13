window.APP_CONFIG = {
  // Senkron modu:
  // local  -> sadece bu cihazda çalışır (farklı cihazda talep görünmez).
  // remote -> farklı cihazların aynı talepleri görmesi için zorunlu.
  // auto   -> /api/state varsa kullanır, yoksa local moda düşer.
  syncMode: "remote",

  // (Opsiyonel) Farklı bir backend adresi kullanacaksan buraya yazabilirsin.
  // syncMode remote/auto iken boş bırakırsan otomatik olarak bu sitenin kendi /api/state adresi kullanılır.
  apiBaseUrl: "",

  // İstanbul vakti girince otomatik çalacak ezan sesi (doğrudan .mp3/.ogg linki ver; YouTube linki olmaz)
  ezanAudioUrl: "/assets/ezan.mp3",
};
