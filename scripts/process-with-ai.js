// scripts/process-with-ai.js — ЭКОНОМНАЯ версия с автодополнением
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-4o";

console.log("🚀 Запускаем AI-обработку статей (GPT-4o с автодополнением)...");

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
      console.log(`\n🔍 Статья ${i-1}: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Слов: ${originalWordCount}`);

      let uniqueTitle = "";
      let uniqueText = "";

      try {
        // 1. Заголовок
        console.log("   💡 Генерируем заголовок...");
        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Создай эмоциональный заголовок в стиле Дзен. Оригинал: "${originalTitle}"`
          }],
          max_tokens: 100,
          temperature: 0.8
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // 2. Текст (одним запросом)
        console.log("   ✍️ Переписываем текст...");
        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Перепиши этот текст в стиле Дзен (~2500 слов):\n\n${originalText}`
          }],
          max_tokens: 3000,
          temperature: 0.7
        });

        uniqueText = textResponse.choices[0].message.content.trim();
        totalInputTokens += textResponse.usage.prompt_tokens;
        totalOutputTokens += textResponse.usage.completion_tokens;

        // === 🔥 АВТОДОПОЛНЕНИЕ ПРИ НЕДОСТАТОЧНОМ ОБЪЕМЕ ===
        let finalWordCount = uniqueText.split(/\s+/).length;
        const MIN_WORDS = 2500; // Минимальный порог

        if (finalWordCount < MIN_WORDS) {
          console.log(`   ⚠️ Текст короткий (${finalWordCount} слов). Выполняем расширение...`);

          const expandResponse = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{
              role: "user",
              content: `
Текст получился короче требуемого размера.
Дополни его естественно: добавь бытовые сцены, эмоции, диалоги и внутренние мысли.
Не меняй сюжет и структуру.

Текст:
"""${uniqueText}"""
              `
            }],
            max_tokens: 2000,
            temperature: 0.7
          });

          uniqueText = expandResponse.choices[0].message.content.trim();
          totalInputTokens += expandResponse.usage?.prompt_tokens || 0;
          totalOutputTokens += expandResponse.usage?.completion_tokens || 0;
          finalWordCount = uniqueText.split(/\s+/).length;

          console.log(`   ✅ После расширения: ${finalWordCount} слов`);
        }
        // === 🔥 КОНЕЦ АВТОДОПОЛНЕНИЯ ===

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

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(path.join(outputDir, `${i-1}_${safeTitle}.txt`), uniqueText, "utf8");

        processedCount++;
        console.log(`   ✅ Готово: ${finalWordCount} слов`);
        await new Promise(resolve => setTimeout(resolve, 1500));

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