# Changelog

รูปแบบอ้างอิง [Keep a Changelog](https://keepachangelog.com/th/1.1.0/) และ [Semantic Versioning](https://semver.org/lang/th/)

## [Unreleased]

## [1.1.0] - 2026-11-01

### Added

- เก็บประวัติ Logs ลงฐานข้อมูล (`log_entries`) ทุกกิจกรรม พร้อมผู้ใช้ ผู้ดำเนินการ ห้อง และรายละเอียด
- คำสั่ง `/logs history` ค้นประวัติตามผู้ใช้ (`user` / `user-id`), กิจกรรม, ห้อง, คำค้น และช่วงวัน พร้อมปุ่มเปลี่ยนหน้า
- คำสั่ง `/logs stats` สรุปจำนวนตามกิจกรรมและผู้ใช้ที่มีกิจกรรมมากที่สุด
- คำสั่ง `/logs entry` ดูรายละเอียดเต็มของรายการด้วย ID
- แสดงรูปที่ถูกลบใน Logs: บอทเก็บสำเนารูปชั่วคราวใน `data/media/` แล้วแนบกลับในข้อความ Log (ส่งต่อผ่าน Relay ได้) และลบสำเนาเมื่อส่งเสร็จ
- ตัวเลือก `.env`: `LOG_RETENTION_DAYS`, `MEDIA_CACHE`, `MEDIA_MAX_MB`, `MEDIA_CACHE_HOURS`
- บันทึกผู้ดำเนินการของ Ban, Unban และ Timeout จาก Audit Log
- รูปประกอบ README: แบนเนอร์ รูปหมวดหมู่ รูปเครดิต และภาพตัวอย่าง Log รูปที่ถูกลบ

### Changed

- บันทึกฐานข้อมูลแบบหน่วงเวลา (debounce) และเขียนผ่านไฟล์ชั่วคราวเพื่อลดภาระและความเสี่ยงไฟล์เสียหาย
- ใช้ `Events.ClientReady` และ `MessageFlags.Ephemeral` ตามมาตรฐาน discord.js เวอร์ชันใหม่
- บอทขอสิทธิ์ Attach Files ในห้อง Logs ที่สร้างด้วย `/logs setup`
- หากส่งรูปไม่สำเร็จ (เช่น ไฟล์ใหญ่เกินสิทธิ์ของเซิร์ฟเวอร์ปลายทาง) จะส่ง Log แบบไม่มีรูปแทน

### Fixed

- Relay ID ที่แสดงหลังเพิ่ม Relay ให้ถูกต้องเสมอ

## [1.0.0] - 2026-11-01

### Added

- คำสั่ง `/logs setup` สร้างหมวด `LOG SERVER` และ `SYSTEM` พร้อมห้อง Logs อัตโนมัติ
- คำสั่ง `/logs enable`, `/logs disable`, `/logs status`, `/logs channel-set`
- ระบบ Relay ข้ามเซิร์ฟเวอร์แบบเลือก event ได้ ผ่าน `/logs relay-add`, `/logs relay-remove`, `/logs relay-list`, `/logs relay-test`
- บันทึกสมาชิกเข้า/ออก/ถูกเตะ, ข้อความถูกลบ/แก้ไข, ยศ, ห้อง, Voice, แบน/ปลดแบน, เปลี่ยนชื่อเล่น และ Timeout
- ตรวจจับ Kick ผ่าน Audit Log เพื่อแยกจาก Leave
- เก็บค่าตั้งค่าและ Relay ถาวรด้วย SQLite (`data/washi-logs.sqlite`)
- รองรับ Android Termux, Linux และ VPS
- สคริปต์ `npm run check` สำหรับตรวจ syntax

[Unreleased]: https://github.com/YOUR_USERNAME/WASHI-LOG-SYSTEM/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/YOUR_USERNAME/WASHI-LOG-SYSTEM/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/YOUR_USERNAME/WASHI-LOG-SYSTEM/releases/tag/v1.0.0
