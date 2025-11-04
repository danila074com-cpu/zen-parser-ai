// scripts/process-with-ai.js — версия с промтом "Про Жизнь и Счастье" без обложек
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-4o";

console.log("🚀 Запускаем AI-обработку статей (без обложек, стиль 'Про Жизнь и Счастье')...");

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
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4o.xlsx");

    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet("Рабочие статьи");

    newWorksheet.columns = [
      { header: "№", key: "number", width: 5 },
      { header: "Оригинальный заголовок", key: "original_title", width: 35 },
      { header: "Уникальный заголовок", key: "unique_title", width: 45 },
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
        // === 1. Генерация заголовка по шаблону "Про Жизнь и Счастье" ===
        console.log("   💡 Генерируем заголовок...");
        const titlePrompt = `
Ты — копирайтер в стиле Яндекс Дзена, создающий заголовки в духе канала «Про Жизнь и Счастье».

Вот стиль и шаблоны, на которые ориентируйся:

1. Используй яркое, эмоциональное высказывание или прямую речь — с элементом диалога или внутренней реплики героя.
2. Добавляй интригу, конфликт или необычную бытовую ситуацию.
3. Упоминай отношения, делёж имущества, резкие заявления, обиды, шокирующие требования.
4. Не бойся длинных заголовков с прямым обращением или восклицанием.

Примеры:
- «— Я не для того впахивала на двух работах, чтобы ты мою квартиру кому-то подарил!»
- «— Ты вообще в своём уме? — спросила я, когда муж заявил, что мама поживёт с нами!»
- «— Мы разводимся и поделим всё. Даже твою квартиру! — сказал он с холодной улыбкой.»

Задача:
Создай новый заголовок в этом стиле для статьи с исходным заголовком:
"${originalTitle}"

Пиши живо, эмоционально, с конфликтом, в формате прямой речи или внутреннего монолога.
Верни ТОЛЬКО готовый заголовок без комментариев.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 150
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage?.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage?.completion_tokens || 0;

        // === 2. Этап 1: Краткое summary ===
        console.log("   ✍️ Этап 1: создаем краткое резюме...");
        const summaryResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Сократи эту статью до сценарного конспекта (summary) на 600–800 слов.
Опиши всех героев, события и эмоциональные повороты. Без художественных деталей.

Текст:
"""
${originalText}
"""
Верни только summary без комментариев.`
          }],
          temperature: 0.5,
          max_tokens: 1500
        });

        const summaryText = summaryResponse.choices[0].message.content.trim();
        totalInputTokens += summaryResponse.usage?.prompt_tokens || 0;
        totalOutputTokens += summaryResponse.usage?.completion_tokens || 0;

        // === 3. Этап 2: Полный рассказ в стиле MadeSimple ===
        console.log("   ✍️ Этап 2: пишем рассказ...");
        const rewriteResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `На основе этого сценарного конспекта напиши полноценный рассказ для Дзена в стиле "MadeSimple".
Требования:
- Реалистичный, эмоциональный стиль, будто из жизни.
- Диалоги живые, без шаблонов.
- Добавь внутренние монологи, атмосферу, бытовые детали.
- Объем не менее 3000 слов.
- Разбей на абзацы, чтобы удобно читать.

Summary:
"""
${summaryText}
"""

Верни только готовый рассказ без комментариев.`
          }],
          temperature: 0.7,
          max_tokens: 3500
        });

        uniqueText = rewriteResponse.choices[0].message.content.trim();
        totalInputTokens += rewriteResponse.usage?.prompt_tokens || 0;
        totalOutputTokens += rewriteResponse.usage?.completion_tokens || 0;

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

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(
          path.join(outputDir, `${i - 1}_${safeTitle}.txt`),
          uniqueText,
          "utf8"
        );

        processedCount++;
        console.log(`   ✅ Готово: ${originalWordCount} → ${finalWordCount} слов`);
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    await newWorkbook.xlsx.writeFile(outputPath);

    // === Итоговая статистика ===
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
