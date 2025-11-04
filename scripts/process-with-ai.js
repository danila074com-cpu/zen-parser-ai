// scripts/process-with-ai.js — версия с двухэтапным написанием (~2500 слов)
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-4-turbo";

console.log("🚀 Запускаем AI-обработку статей (стиль 'Про жизнь и счастье', ~2500 слов)...");

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY не настроен");
    }

    const inputPath = path.join(
      __dirname,
      "../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx"
    );

    await fs.access(inputPath);
    console.log("✅ Файл найден!");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet("Articles");
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    const outputDir = path.join(__dirname, "../processed");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4Turbo.xlsx");

    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet("Рабочие статьи");

    newWorksheet.columns = [
      { header: "№", key: "number", width: 5 },
      { header: "Оригинальный заголовок", key: "original_title", width: 35 },
      { header: "Уникальный заголовок", key: "unique_title", width: 35 },
      { header: "Оригинальный текст", key: "original_text", width: 80 },
      { header: "Уникальный текст", key: "unique_text", width: 80 },
      { header: "Ориг. слов", key: "original_words", width: 12 },
      { header: "Уник. слов", key: "unique_words", width: 12 },
      { header: "Разница", key: "difference", width: 12 },
      { header: "Статус", key: "status", width: 15 }
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Статья ${i - 1}: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Слов: ${originalWordCount}`);

      let uniqueTitle = "";
      let uniqueText = "";

      try {
        // === ГЕНЕРАЦИЯ ЗАГОЛОВКА ===
        console.log("   💡 Генерируем заголовок...");
        const titlePrompt = `
Сгенерируй заголовок в стиле дзен-канала “Про жизнь и счастье”.
Используй прямую речь, бытовой или семейный конфликт, добавь интригу и эмоции.
Например: “— Я не для того впахивала на двух работах, чтобы ты мою квартиру кому-то подарил!”

Оригинальный заголовок: "${originalTitle}"

Выведи ТОЛЬКО новый заголовок без пояснений.
`;
        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.8,
          max_tokens: 150
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // === ЭТАП 1: СОЗДАНИЕ КРАТКОГО РЕЗЮМЕ ===
        console.log("   ✍️ Этап 1: создаем краткое резюме...");
        const summaryPrompt = `
Ты — профессиональный редактор и сценарист.
Составь краткое резюме статьи (3–4 предложения): кто герои, в чем конфликт, мораль.
Не переписывай, просто выдели суть.

Текст:
"""
${originalText}
"""
`;
        const summaryResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: summaryPrompt }],
          temperature: 0.5,
          max_tokens: 400
        });

        const summary = summaryResponse.choices[0].message.content.trim();
        totalInputTokens += summaryResponse.usage.prompt_tokens;
        totalOutputTokens += summaryResponse.usage.completion_tokens;

        // === ЭТАП 2.1: ПЕРВАЯ ПОЛОВИНА РАССКАЗА ===
        console.log("   ✍️ Этап 2.1: пишем первую половину (≈1250 слов)...");
        const part1Prompt = `
Ты профессиональный копирайтер, который пишет в стиле канала «Про Жизнь и Счастье» (Дзен).
На основе этого резюме создай первую часть истории (около 1250 слов).

Стиль:
- Реалистичный, эмоциональный, живые диалоги.
- Сразу вводи конфликт и атмосферу.
- Используй бытовые детали, эмоции, короткие абзацы.

Резюме:
"""
${summary}
"""

Начни с сильной реплики или действия.
`;
        const part1Response = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: part1Prompt }],
          temperature: 0.8,
          max_tokens: 4000
        });

        const part1 = part1Response.choices[0].message.content.trim();
        totalInputTokens += part1Response.usage.prompt_tokens;
        totalOutputTokens += part1Response.usage.completion_tokens;

        // === ЭТАП 2.2: ВТОРАЯ ПОЛОВИНА (ФИНАЛ) ===
        console.log("   ✍️ Этап 2.2: дописываем финал (≈1250 слов)...");
        const part2Prompt = `
Продолжи следующую историю в том же стиле канала «Про Жизнь и Счастье» (Дзен).
Добавь развитие конфликта, внутренние монологи и финал с моралью.
Длина ~1250 слов.

Вот первая часть:
"""
${part1}
"""
`;
        const part2Response = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: part2Prompt }],
          temperature: 0.8,
          max_tokens: 4000
        });

        const part2 = part2Response.choices[0].message.content.trim();
        totalInputTokens += part2Response.usage.prompt_tokens;
        totalOutputTokens += part2Response.usage.completion_tokens;

        // === ОБЪЕДИНЕНИЕ ===
        uniqueText = (part1 + "\n\n" + part2).trim();
        const finalWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);

        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: finalWordCount,
          difference: `${diffPercent}%`,
          status: "✅ Готово"
        });

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "").substring(0, 40);
        await fs.writeFile(
          path.join(outputDir, `${i - 1}_${safeTitle}.txt`),
          uniqueText,
          "utf8"
        );

        console.log(`   ✅ Готово: ${originalWordCount} → ${finalWordCount} слов (≈ ${diffPercent > 0 ? "+" : ""}${diffPercent}%)`);
        processedCount++;

        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    await newWorkbook.xlsx.writeFile(outputPath);

    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;
    const totalCost = inputCost + outputCost;

    console.log("\n🎉 ====== ГОТОВО ======");
    console.log(`📊 Обработано: ${processedCount} статей`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log("💰 ====== РАСХОДЫ ======");
    console.log(`🔹 Входные токены: ${totalInputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})`);
    console.log(`🔹 Выходные токены: ${totalOutputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})`);
    console.log(`💵 Итого: ~$${totalCost.toFixed(4)}`);

  } catch (error) {
    console.error("💥 Критическая ошибка:", error.message);
    process.exit(1);
  }
}

processArticles();
