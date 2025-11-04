// scripts/process-with-ai.js — стабильная версия
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");
const axios = require("axios");

// Инициализация OpenAI
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

const AI_MODEL = "gpt-4o";

// Настройки KIE API
const KIE_API_URL = "https://api.kie.ai/v1/images/generations";
const KIE_API_KEY = process.env.KIE_API_KEY;
const IMAGE_OUTPUT_DIR = path.join(__dirname, "../processed/images");

console.log("🚀 Запускаем AI-обработку статей...");

// Функция для создания промпта изображения
async function generateImagePrompt(title, text) {
  try {
    const promptInstruction = `
Создай промпт для генерации изображения к статье. Требования:
- Реалистичная фотография, кинематографичное освещение
- Формат 1:1, яркие цвета, эмоциональная сцена
- Люди в кадре, естественные позы
- Советская/русская бытовая атмосфера
- Без текста и водяных знаков

Заголовок: "${title}"
Текст: "${text.substring(0, 500)}"

Верди только английский промпт.
    `;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: promptInstruction }],
      max_tokens: 200
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.log("   ⚠️ Ошибка создания промпта:", error.message);
    return "realistic photo 1:1, family scene, emotional drama, Soviet apartment interior";
  }
}

// Функция генерации изображения
async function generateImageFromPrompt(prompt, filename) {
  try {
    if (!KIE_API_KEY) {
      console.log("   ⚠️ KIE_API_KEY не настроен");
      return null;
    }

    console.log("   🎨 Генерируем изображение...");
    
    const requestBody = {
      model: "flux-pro",
      prompt: prompt,
      width: 1024,
      height: 1024,
      num_outputs: 1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`
    };

    const response = await axios.post(KIE_API_URL, requestBody, { 
      headers,
      timeout: 60000 
    });

    let imageUrl;
    if (response.data.data && response.data.data[0] && response.data.data[0].url) {
      imageUrl = response.data.data[0].url;
    } else {
      console.log("   ⚠️ Неизвестный формат ответа");
      return null;
    }

    // Скачиваем изображение
    const imageResponse = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer'
    });

    const filePath = path.join(IMAGE_OUTPUT_DIR, `${filename}.png`);
    await fs.mkdir(IMAGE_OUTPUT_DIR, { recursive: true });
    await fs.writeFile(filePath, imageResponse.data);
    
    console.log(`   ✅ Изображение сохранено: ${filename}.png`);
    return filePath;

  } catch (error) {
    console.log(`   ❌ Ошибка генерации: ${error.message}`);
    return null;
  }
}

// Основная функция
async function processArticles() {
  try {
    // Проверка API ключей
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY не настроен");
    }

    console.log("🔍 Проверяем KIE API...");
    const kieAvailable = KIE_API_KEY ? true : false;
    console.log(kieAvailable ? "✅ KIE API доступен" : "⚠️ KIE API не настроен");

    // Путь к файлу с статьями
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
    const outputPath = path.join(outputDir, "рабочие_статьи_GPT4o.xlsx");

    // Создание нового Excel файла
    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet("Рабочие статьи");

    // Колонки таблицы
    newWorksheet.columns = [
      { header: "№", key: "number", width: 5 },
      { header: "Оригинальный заголовок", key: "original_title", width: 35 },
      { header: "Уникальный заголовок", key: "unique_title", width: 35 },
      { header: "Оригинальный текст", key: "original_text", width: 80 },
      { header: "Уникальный текст", key: "unique_text", width: 80 },
      { header: "Ориг. слов", key: "original_words", width: 12 },
      { header: "Уник. слов", key: "unique_words", width: 12 },
      { header: "Разница", key: "difference", width: 12 },
      { header: "Обложка", key: "cover", width: 15 },
      { header: "Статус", key: "status", width: 15 }
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
      console.log(`\n🔍 Статья ${i-1}: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Слов: ${originalWordCount}`);

      let uniqueTitle = "";
      let uniqueText = "";
      let coverStatus = "❌ Нет";

      try {
        // 1. Генерация заголовка
        console.log("   💡 Генерируем заголовок...");
        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user",
            content: `Создай новый заголовок в стиле "MadeSimple" для Дзен. Оригинал: "${originalTitle}". Верди только заголовок.`
          }],
          temperature: 0.8,
          max_tokens: 100
        });

        uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // 2. Генерация текста
        console.log("   ✍️ Переписываем текст...");
        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{
            role: "user", 
            content: `Перепиши этот текст в стиле "MadeSimple" для Яндекс Дзен. Сохрани сюжет и эмоции, но измени формулировки. Объем около 3000 слов.\n\n${originalText}`
          }],
          temperature: 0.7,
          max_tokens: 4000
        });

        uniqueText = textResponse.choices[0].message.content.trim();
        totalInputTokens += textResponse.usage.prompt_tokens;
        totalOutputTokens += textResponse.usage.completion_tokens;

        // 3. Генерация обложки
        if (kieAvailable) {
          console.log("   🎨 Создаем обложку...");
          const imagePrompt = await generateImagePrompt(uniqueTitle, uniqueText);
          const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "").substring(0, 30);
          const imageResult = await generateImageFromPrompt(imagePrompt, `${i-1}_${safeTitle}`);
          coverStatus = imageResult ? "✅ Да" : "❌ Ошибка";
        }

        const finalWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);

        // Сохранение в Excel
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: finalWordCount,
          difference: `${diffPercent}%`,
          cover: coverStatus,
          status: "✅ Готово"
        });

        // Сохранение текстового файла
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(
          path.join(outputDir, `${i-1}_${safeTitle}.txt`), 
          uniqueText, 
          "utf8"
        );

        processedCount++;
        console.log(`   ✅ Готово: ${originalWordCount} → ${finalWordCount} слов`);
        
        // Задержка между статьями
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // Сохранение Excel файла
    await newWorkbook.xlsx.writeFile(outputPath);

    // Статистика
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

// Запуск обработки
processArticles();