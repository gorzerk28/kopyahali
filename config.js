window.APP_CONFIG = {
  // Sevgilin için kullanıcı adı + site giriş şifresi
  partnerUsername: "güzel kızım",
  sitePassword: "iremhasekisultan",
  // Sadece sana özel admin panel şifresi
  adminPassword: "gorzerk28",
  // (Opsiyonel) Kalp Sorumlusu'nun site kapısından giriş bilgileri
  ownerUsername: "kalpsorumlusu",
  ownerSitePassword: "gorzerk28",
  // Talep cevaplandığında bildirimin gideceği e-posta
  partnerEmail: "iremm222aksoy@gmail.com",
  // Senkron modu:
  // local  -> sadece bu cihazda çalışır (farklı cihazda talep görünmez).
  // remote -> farklı cihazların aynı talepleri görmesi için zorunlu.
  // auto   -> /api/state varsa kullanır, yoksa local moda düşer.
  syncMode: "remote",

  // (Opsiyonel) Farklı bir backend adresi kullanacaksan buraya yazabilirsin.
  // syncMode remote/auto iken boş bırakırsan otomatik olarak bu sitenin kendi /api/state adresi kullanılır.
  apiBaseUrl: "",

  // İstanbul vakti girince otomatik çalacak ezan sesi (doğrudan .mp3/.ogg linki ver; YouTube linki olmaz)
  ezanAudioUrl: "",
};
