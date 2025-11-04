// scripts/process-with-ai.js — версия для 2500 слов (GPT-4-Turbo, без обложек)
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");

// 🔑 Инициализация OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_MODEL = "gpt-4-turbo";

console.log("🚀 Запускаем AI-обработку статей (стиль 'Про Жизнь и Счастье', ~2500 слов)...");

// Основная функция
async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY не настроен");

    // Путь к файлу
    const inputPath = path.join(
      __dirname,
      "../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx"
    );
    await fs.access(inputPath);
    console.log("✅ Файл найден!");

    // Чтение Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet("Articles");
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Подготовка выходной директории
    const outputDir = path.join(__dirname, "../processed");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4Turbo.xlsx");

    // Создание нового Excel
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
      { header: "Статус", key: "status", width: 15 },
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Обработка статей
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
        // === 1. Генерация заголовка в стиле “Про Жизнь и Счастье” ===
        console.log("   💡 Генерируем заголовок...");
        const titlePrompt = `
Сгенерируй заголовок в стиле дзен-канала “Про Жизнь и Счастье”.
Используй прямую речь, бытовой или семейный конфликт, добавь интригу и эмоции.
Примеры:
— Я не для того впахивала на двух работах, чтобы ты мою квартиру кому-то подарил!
— Ты вообще в своём уме? — спросила я, когда увидела, что он пакует чемодан.
Оригинальный заголовок: "${originalTitle}"
Верни только заголовок.`;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.85,
          max_tokens: 120,
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage.completion_tokens || 0;

        // === 2. Создаем краткое резюме сюжета ===
        console.log("   ✍️ Этап 1: создаем краткое резюме...");
        const summaryResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Сделай краткое резюме (до 300 слов) этого текста.
Выдели главных героев, их отношения, суть конфликта и финал. Без диалогов:
"""
${originalText}
"""`,
          }],
          temperature: 0.5,
          max_tokens: 800,
        });
        const summary = summaryResponse.choices[0].message.content.trim();
        totalInputTokens += summaryResponse.usage.prompt_tokens || 0;
        totalOutputTokens += summaryResponse.usage.completion_tokens || 0;

        // === 3. Пишем новую статью (2500 слов) ===
        console.log("   ✍️ Этап 2: пишем рассказ (2500 слов)...");
        const storyResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Ты — профессиональный автор Дзена.
На основе краткого сюжета ниже напиши реалистичный рассказ длиной около 2500 слов 
в стиле канала «Про Жизнь и Счастье». 
Добавь живые диалоги, бытовые детали, внутренние монологи и мораль в конце. 
Строго соблюдай стиль, структуру и язык канала.
Вот краткое резюме:
"""
${summary}
"""`,
          }],
          temperature: 0.75,
          max_tokens: 4000, // хватает на 2400–2600 слов
        });

        uniqueText = storyResponse.choices[0].message.content.trim();
        totalInputTokens += storyResponse.usage.prompt_tokens || 0;
        totalOutputTokens += storyResponse.usage.completion_tokens || 0;

        // === Подсчёт ===
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
          status: "✅ Готово",
        });

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, "utf8");

        processedCount++;
        console.log(`   ✅ Готово: ${finalWordCount} слов`);
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.log(`   ❌ Ошибка: ${err.message}`);
      }
    }

    // === Сохраняем Excel ===
    await newWorkbook.xlsx.writeFile(outputPath);

    // === Подсчёт расходов ===
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

// 🚀 Запуск
processArticles();
