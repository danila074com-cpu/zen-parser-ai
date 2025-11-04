// scripts/process-with-ai.js — версия без обложек, с новым промтом "Про жизнь и счастье"
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL = "gpt-4o";

console.log("🚀 Запускаем AI-обработку статей (без обложек, стиль 'Про Жизнь и Счастье')...");

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY не настроен");
    }

    // Путь к исходному файлу
    const inputPath = path.join(
      __dirname,
      "../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx"
    );

    await fs.access(inputPath);
    console.log("✅ Файл найден!");

    // Загружаем Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet("Articles");
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Подготовка выходной директории
    const outputDir = path.join(__dirname, "../processed");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4o.xlsx");

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
        // === 1. Генерация заголовка ===
        console.log("   💡 Генерируем заголовок...");
        const titlePrompt = `
Создай эмоциональный, интригующий заголовок в стиле Дзен-канала «Про Жизнь и Счастье».
Используй прямую речь, бытовой или семейный конфликт, добавь эмоции и интригу.
Оригинальный заголовок: "${originalTitle}"

Примеры:
- "— Я не для того впахивала на двух работах, чтобы ты мою квартиру кому-то подарил!"
- "— Ты что, совсем с ума сошла? — сказал муж, когда я показала ему подарок."
- "— А с какой радости я должна терпеть твою мать у нас в квартире?"

Выведи ТОЛЬКО готовый заголовок.`;
        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.8,
          max_tokens: 150,
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // === 2. Генерация текста по мотивам оригинала ===
        console.log("   ✍️ Этап 1: создаем краткое резюме...");
        const shortSummary = originalText.substring(0, 500);

        console.log("   ✍️ Этап 2: пишем рассказ...");
        const storyPrompt = `
Ты профессиональный копирайтер и редактор.
Напиши рассказ-историю в стиле канала «Про Жизнь и Счастье» (Дзен):

Исходные данные (идея и настроение):
"${originalTitle}"
"${shortSummary}"

ТРЕБОВАНИЯ:
- Создай абсолютно новый сюжет, основанный на тех же эмоциях и типе конфликта.
- Используй реалистичные бытовые сцены и живые диалоги.
- Добавь внутренние монологи и наблюдения героя.
- Сразу введи конфликт или проблему в первой сцене.
- Ритм — динамичный, язык простой и разговорный.
- Герои — обычные люди: муж, жена, свекровь, дочь, сосед, коллега.
- В конце добавь мораль или размышление, как в статьях «Про Жизнь и Счастье».
- Объем: не менее 3000 слов (≈18 000–20 000 символов).

Пример начала:
"Хорошо, что ты дома. Я за ключами, — сухо произнесла свекровь..."
Пример финала:
"С того дня многое изменилось, но одну вещь поняла точно — иногда лучше сказать правду сразу."

Выведи ТОЛЬКО готовый рассказ с заголовком в начале.`;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: storyPrompt }],
          temperature: 0.8,
          max_tokens: 7000,
        });

        uniqueText = textResponse.choices[0].message.content.trim();
        totalInputTokens += textResponse.usage.prompt_tokens;
        totalOutputTokens += textResponse.usage.completion_tokens;

        // === 3. Подсчёт и сохранение ===
        const finalWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round(
          ((finalWordCount - originalWordCount) / originalWordCount) * 100
        );

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

        // Сохранение текстового файла
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(
          path.join(outputDir, `${i - 1}_${safeTitle}.txt`),
          uniqueText,
          "utf8"
        );

        processedCount++;
        console.log(`   ✅ Готово: ${originalWordCount} → ${finalWordCount} слов`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // Сохраняем Excel
    await newWorkbook.xlsx.writeFile(outputPath);

    // === Финальная статистика ===
    const inputCost = (totalInputTokens / 1_000_000) * 2.5;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.0;
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
