import "dotenv/config";
import { stat, unlink } from "fs/promises";
import { prisma } from "../lib/db";

async function main() {
  console.log("Bắt đầu dọn dẹp các file log đã được đồng bộ...");
  const states = await prisma.syncState.findMany();
  let deletedCount = 0;
  let freedBytes = BigInt(0);

  for (const state of states) {
    try {
      const filePath = state.filePath.replace(/^(gemini|codex|cline):/, "");
      
      // Bỏ qua việc xoá data của Cline vì Cline cần file để hiển thị UI trong VSCode
      if (state.filePath.startsWith("cline:")) continue;

      const fileStat = await stat(filePath);
      const currentSize = BigInt(fileStat.size);

      // Nếu file đã được đồng bộ hoàn toàn (kích thước trên đĩa = kích thước đã sync)
      if (currentSize === state.lastSize && currentSize > BigInt(0)) {
        await unlink(filePath);
        deletedCount++;
        freedBytes += currentSize;
        console.log(`[Đã xoá] ${filePath} (${(Number(currentSize) / 1024).toFixed(2)} KB)`);
        
        // Reset lastSize về 0 trong DB để nếu tool tạo lại file cùng tên, hệ thống sẽ đọc từ đầu
        await prisma.syncState.update({
          where: { filePath: state.filePath },
          data: { lastSize: BigInt(0) },
        });
      }
    } catch (e: unknown) {
      // Bỏ qua các file không tồn tại (đã bị xoá từ trước)
      const err = e as { code?: string; message?: string };
      if (err.code !== "ENOENT") {
        console.error(`Lỗi khi xử lý ${state.filePath}:`, err.message || String(e));
      }
    }
  }

  const mb = (Number(freedBytes) / 1024 / 1024).toFixed(2);
  console.log(`\nHoàn tất! Đã xoá ${deletedCount} file, giải phóng ${mb} MB dung lượng.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
