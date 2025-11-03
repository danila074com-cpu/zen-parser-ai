// scripts/process-with-ai.js — версия под GPT-4o (MadeSimple, 2-этапный рерайт до 3500+ слов)
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_MODEL = "gpt-4o";

console.log("🚀 Запускаем AI-обработку статей (GPT-4o, двухэтапный рерайт)...");

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("❌ Не найден ключ OpenAI API!");
      return;
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
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4o.xlsx");

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
      { header: "Перегенераций", key: "regens", width: 14 },
      { header: "Статус", key: "status", width: 20 }
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
      console.log(`\n🔍 Обработка статьи: "${originalTitle.substring(0, 60)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      let regenCount = 0;
      let uniqueText = "";

      try {
        // === 1. Новый заголовок ===
        console.log("   💡 Генерируем новый заголовок...");
        const titlePrompt = `
Ты — копирайтер в стиле канала "MadeSimple" (Яндекс Дзен).
Создай эмоциональный, реалистичный заголовок в том же ритме и интонации.
Сохрани русскую атмосферу, без кликбейта и мотивационных штампов.
Не используй западные имена.

Оригинальный заголовок:
"${originalTitle}"

Верни только новый заголовок без кавычек.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 120
        });

        let uniqueTitle = titleResponse.choices[0].message.content
          .replace(/["']/g, "")
          .trim();

        totalInputTokens += titleResponse.usage.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage.completion_tokens || 0;

        // === 2. Переписываем текст в два этапа ===
        console.log("   ✍️ Переписываем первую половину...");
        const halfPrompt = `
Ты — профессиональный автор реалистичных рассказов для Яндекс Дзена.
Перепиши ПЕРВУЮ ПОЛОВИНУ этой истории в духе MadeSimple, сохранив атмосферу, эмоции и ключевые сцены.
Пиши естественно, живо, с внутренними монологами и бытовыми деталями.
Объем первой части — около 1800 слов.

Текст:
"""${originalText}"""

Верни только готовый текст первой половины без комментариев.
        `;

        const part1 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: halfPrompt }],
          temperature: 0.8,
          max_tokens: 4500
        });

        let part1Text = part1.choices[0].message.content.trim();
        totalInputTokens += part1.usage.prompt_tokens || 0;
        totalOutputTokens += part1.usage.completion_tokens || 0;

        console.log("   ✍️ Переписываем продолжение...");
        const continuePrompt = `
Продолжи этот рассказ с того момента, где закончилась предыдущая часть.
Сохрани стиль, интонацию и атмосферу. Заверши историю логично, с моралью или эмоциональной точкой.
Объем второй части — около 1800 слов.
Вот первая часть:
"""${part1Text}"""
Теперь напиши продолжение.
        `;

        const part2 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: continuePrompt }],
          temperature: 0.8,
          max_tokens: 4500
        });

        let part2Text = part2.choices[0].message.content.trim();
        totalInputTokens += part2.usage.prompt_tokens || 0;
        totalOutputTokens += part2.usage.completion_tokens || 0;

        uniqueText = `${part1Text}\n\n${part2Text}`;

        // === Проверяем итоговый объем ===
        let finalWordCount = uniqueText.split(/\s+/).length;
        if (finalWordCount < 2000) {
          console.log("   ⚠️ Текст слишком короткий — выполняем одну перегенерацию...");
          regenCount++;
          const regenPrompt = `
Перепиши этот текст подробнее, добавь внутренние мысли, атмосферу и финальные сцены.
Объем — около 3500 слов. Не меняй сюжет, просто сделай повествование насыщеннее.
"""${uniqueText}"""
          `;
          const regen = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: "user", content: regenPrompt }],
            temperature: 0.8,
            max_tokens: 4500
          });
          uniqueText = regen.choices[0].message.content.trim();
          totalInputTokens += regen.usage.prompt_tokens || 0;
          totalOutputTokens += regen.usage.completion_tokens || 0;
          finalWordCount = uniqueText.split(/\s+/).length;
        }

        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 20 ? "✅ Сохранен" : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${finalWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);
        console.log(`   🔁 Перегенераций: ${regenCount}`);

        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: finalWordCount,
          difference: volumeStatus,
          regens: regenCount,
          status: "✅ Готово"
        });

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, "utf8");

        processedCount++;
        await new Promise((resolve) => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // === Расчет стоимости ===
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;
    const totalCost = inputCost + outputCost;
    const avgCost = processedCount ? totalCost / processedCount : 0;

    await newWorkbook.xlsx.writeFile(outputPath);

    console.log("\n🎉 ====== ГОТОВО ======");
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log("💰 ====== РАСХОДЫ ======");
    console.log(`🔹 Входные токены: ${totalInputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})`);
    console.log(`🔹 Выходные токены: ${totalOutputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})`);
    console.log(`💵 Итого: ~$${totalCost.toFixed(4)} (≈ $${avgCost.toFixed(4)} за статью)`);

  } catch (error) {
    console.error("💥 Критическая ошибка:", error.message);
  }
}

processArticles();
