# Changelog

รูปแบบอ้างอิง [Keep a Changelog](https://keepachangelog.com/th/1.1.0/) และ [Semantic Versioning](https://semver.org/lang/th/)

## [Unreleased]

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

[Unreleased]: https://github.com/YOUR_USERNAME/WASHI-LOG-SYSTEM/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/YOUR_USERNAME/WASHI-LOG-SYSTEM/releases/tag/v1.0.0
