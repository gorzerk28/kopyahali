# Ömürlük Kilitli Talep (Öneri Tasarımı)

Bu özellik, yanlışlıkla silinme riskini sıfıra yaklaştırmak için talebe "kalıcı koruma" katmanı ekler.

## 1) Nereden yönetilecek?

Yönetim **yalnızca Admin panelinden** yapılır.

- Her talep kartına yeni bir aksiyon:
  - `🔒 Ömürlük Kilitle`
  - Kilitliyse: `🔓 Kilidi Aç` (çift onay)
- Partner ekranında sadece rozet görünür; aksiyon görünmez.

## 2) Kilitleyince ne değişecek?

Kilit aktif olan taleplerde:

1. **Kalıcı Sil** butonu pasif olur (veya gizlenir).
2. Arşive alma serbest kalabilir (isteğe bağlı politika).
3. Restore/backup akışında bu talep “korunan kayıt” olarak tutulur.
4. Silme denemesi yapılırsa işlem log’a düşer ve engellenir.

## 3) Veri modeli (öneri)

Her talebe bu alanlar eklenir:

- `isLocked: boolean`
- `lockedAt: string | null` (ISO tarih)
- `lockedBy: string | null` (admin kullanıcı adı / rol)
- `lockReason: string` (opsiyonel not)

## 4) Sunucu tarafı kuralı (kritik)

Sadece frontend değil, server merge/sanitize tarafı da zorunlu kontrol eder:

- `deletedRequestIds` içine kilitli bir id gelirse server bunu **reddeder**.
- Böylece farklı cihazdan gelen hatalı senkron da kilitli talebi silemez.

## 5) UI örnek görünüm (taslak)

Admin kartı örneği:

- Başlık: `Yıldönümü Planı`
- Rozet: `🔒 Ömürlük Kilitli`
- Aksiyonlar:
  - `Yanıtla`
  - `Arşive Al`
  - `🔓 Kilidi Aç` (çift onay + sebep)
  - `Kalıcı Sil` (kilitliyken pasif)

Partner kartı örneği:

- Başlık yanında sadece rozet: `🔒 Bu talep ömürlük korunuyor`

## 6) Güvenlik ve yanlış kullanım önlemleri

- Kilit açma işleminde **iki adımlı onay**:
  1) modal onayı
  2) "KİLİDİ AÇ" metnini yazarak doğrulama
- Tüm kilit/kilit açma işlemleri activity timeline’a yazılır.
- İsteğe bağlı: kilitli talep düzenleme de sadece admin olsun.

## 7) Beklenen kullanıcı etkisi

- "Talep kaybolur mu?" kaygısı ciddi şekilde azalır.
- Yanlışlıkla silme/geri yükle karmaşası azalır.
- Güvenli ve net bir yönetim akışı oluşur.
