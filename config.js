window.APP_CONFIG = {
  // Güvenlik notu:
  // Şifre/kullanıcı adı gibi gizli bilgiler burada tutulmaz.
  // Bunları Render Environment Variables üzerinden yönet:
  // SITE_USERNAME, SITE_PASSWORD, OWNER_USERNAME, OWNER_SITE_PASSWORD, ADMIN_PASSWORD, AUTH_SECRET

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
  ezanAudioUrl: "https://pratikbilgievi.net/wp-content/uploads/2021/01/ogle-ezani-rast-abdulkadir-sehitoglu.mp3",
};
