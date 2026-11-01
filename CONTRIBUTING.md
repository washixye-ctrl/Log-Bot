# แนวทางการมีส่วนร่วม

ขอบคุณที่สนใจร่วมพัฒนา WASHI LOG SYSTEM

## รายงานปัญหา

1. ค้นหา Issue เดิมก่อนว่ามีคนแจ้งไว้แล้วหรือไม่
2. เปิด Issue ใหม่ พร้อมข้อมูลดังนี้
   - เวอร์ชัน Node.js และระบบปฏิบัติการ (เช่น Termux, Ubuntu, VPS)
   - ขั้นตอนที่ทำให้เกิดปัญหา
   - ผลที่คาดหวัง และผลที่เกิดขึ้นจริง
   - ข้อความ Error (ลบ Token และข้อมูลส่วนตัวออกก่อนเสมอ)

ปัญหาด้านความปลอดภัยให้อ่าน [SECURITY.md](SECURITY.md) ห้ามเปิดเป็น Issue สาธารณะ

## เสนอฟีเจอร์

เปิด Issue อธิบายปัญหาที่ต้องการแก้ และแนวทางที่คิดไว้ เพื่อคุยกันก่อนเริ่มเขียนโค้ด

## ส่ง Pull Request

1. Fork แล้วสร้างสาขาใหม่จาก `main`

```bash
git checkout -b feature/ชื่อฟีเจอร์
```

2. ติดตั้งและตรวจ syntax

```bash
npm install
npm run check
```

3. ทดสอบกับเซิร์ฟเวอร์ทดสอบของคุณเอง โดยตั้ง `GUILD_ID` ใน `.env` เพื่อ register คำสั่งได้เร็ว
4. Commit ด้วยข้อความที่สื่อความหมาย เช่น `feat: เพิ่ม event invite_create`, `fix: แก้ Relay ซ้ำ`
5. อัปเดต `CHANGELOG.md` ในหัวข้อ `[Unreleased]`
6. เปิด Pull Request พร้อมอธิบายสิ่งที่เปลี่ยนและวิธีทดสอบ

## หลักการเขียนโค้ด

- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- ไม่ commit `.env`, Token, ไฟล์ฐานข้อมูล หรือโฟลเดอร์ `data/media/`
- ขอสิทธิ์ Discord เท่าที่จำเป็น ไม่ขอ Administrator
- เพิ่ม event ใหม่ให้ครบ ได้แก่ `LOG_EVENTS` ใน `src/config.js`, handler ใน `src/events/index.js` (ใส่ `record` เพื่อให้ค้นด้วย `/logs history` ได้), ตาราง Event keys ใน README และ CHANGELOG
- เพิ่มไฟล์ใหม่ใน `src/` ให้เพิ่มลงสคริปต์ `check` ใน `package.json` ด้วย

## สัญญาอนุญาต

การส่งโค้ดเข้ามาถือว่าคุณยินยอมให้เผยแพร่ภายใต้ [MIT License](LICENSE)
