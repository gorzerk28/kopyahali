# Kalp Postası (kopyahali)

Bu proje, partner odaklı bir “talep/istek takip” uygulamasıdır.
Tek sayfa arayüz (`index.html` + `app.js`) ve küçük bir Node.js sunucudan (`server.js`) oluşur.

## Mimari Özeti
- **Ön yüz (client):** `index.html`, `styles.css`, `app.js`
  - Tüm ekran akışı ve etkileşim mantığı `app.js` içindedir.
  - Local storage + remote API senkronizasyonu birlikte desteklenir.
- **Sunucu (backend):** `server.js`
  - Statik dosya sunumu + `/api/*` endpointleri.
  - Durum dosyasını (`data/shared-state.json`) atomik yazar, yedek ve ledger tutar.
- **Konfigürasyon:** `config.js` + environment değişkenleri.

## Temel Özellikler
- Site giriş akışı (partner/owner ayrımı) ve admin paneli.
- Talep oluşturma, takip etme, yönetme.
- Bildirim gönderimi (mail/telegram sağlayıcılarına göre).
- Partner çevrimiçi durumu (presence).
- Günlük sevgi mesajları, ayet listesi ve aktivite/log kayıtları.
- Servis duraklatma (Sinirli Mod) banner ve yönetimi.
- Namaz/Ezan modu, test tetikleme ve durum takibi.

## Veri Katmanları ve Çakışma Riskleri
- **Client state:** `app.js` içinde `state` objesi.
- **Persist katmanları:** LocalStorage anahtarları + remote `/api/state`.
- **Server state:** `shared-state.json` (yedekler + ledger ile korunur).

Bu projede bir özelliğe dokunurken, aşağıdaki alanlar en sık birbirini etkiler:
1. `state` şemasındaki bir alanın adı/değeri değişirse, hem client yükleme/yazma hem server sanitize kısmı etkilenir.
2. Kimlik doğrulama endpointleri (`/api/auth/*`) değişirse, client login/logout akışları da güncellenmelidir.
3. Talep silme/geri yükleme mantığında `deletedRequestIds` ile `requests` eş zamanlı ele alınmalıdır.
4. Presence, prayer ve service pause gibi “anlık durum” alanları UI bannerlarıyla bağlıdır.

## Güvenli Değişiklik Rehberi (Diğer Özellikleri Bozmamak İçin)
Bir düzenleme yaparken şu sırayı izleyin:
1. **Önce etki analizi:** Değişecek alanın `app.js` ve `server.js` kullanım noktalarını birlikte tarayın.
2. **State şemasını koruyun:** Yeni alan eklerken default değerini hem client hem server tarafında tanımlayın.
3. **Geriye uyumluluk bırakın:** Eski localStorage/state kayıtlarıyla açılış bozulmamalı.
4. **Tekil kaynak ilkesi:** Aynı veriyi iki farklı isimle üretmeyin.
5. **Kontrol komutunu çalıştırın:**
   - `npm run check`

## Hızlı Çalıştırma
```bash
npm install
npm start
```

## Geliştirme Notu
Kullanıcı isteği geldiğinde hedeflenen özelliği bu mimariye göre izole şekilde güncellemek, mevcut akışları kırmadan ilerlemek için zorunludur.
