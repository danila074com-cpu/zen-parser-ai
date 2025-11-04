// scripts/process-with-ai.js — версия для KIE API
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");
const axios = require("axios");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_MODEL = "gpt-4o";

// 🔑 KIE API НАСТРОЙКИ
const KIE_API_URL = "https://api.kie.ai/v1/images/generations";
const KIE_API_KEY = process.env.KIE_API_KEY; // Добавь этот секрет в GitHub
const IMAGE_OUTPUT_DIR = path.join(__dirname, "../processed/images");

console.log("🚀 Запускаем AI-обработку с KIE API для обложек...");

// Функция создания промпта для KIE API
async function generateImagePrompt(title, text) {
  const promptInstruction = `
Ты — сценарист для генерации изображений. Создай промпт для KIE API к статье в стиле Яндекс Дзен.
Требования к изображению:
- Реалистичная фотография, кинематографичное освещение
- Формат 1:1, яркие цвета, эмоциональная сцена
- Люди в кадре (не крупный план), естественные позы
- Советская/русская бытовая атмосфера 1980-1990х
- Эмоции: семейная драма, конфликт, бытовые отношения
- Без текста, без водяных знаков, без жёлтого фона

Основа для промпта:

Заголовок: "${title}"
Текст: """${text.substring(0, 800)}"""

Верди только английский промпт в формате:
"realistic photo 1:1, cinematic lighting, vivid colors, {детали сцены}, {эмоции}, {атмосфера}, Soviet/Russian style"
  `;

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: "user", content: promptInstruction }],
    temperature: 0.8,
    max_tokens: 300,
  });

  return response.choices[0].message.content.trim();
}

// Функция генерации изображения через KIE API
async function generateImageFromPrompt(prompt, filename, attempt = 1) {
  try {
    console.log(`   🎨 Генерация изображения через KIE API (попытка ${attempt})...`);
    console.log(`   📝 Промпт: ${prompt}`);

    // 📨 ЗАПРОС ДЛЯ KIE API
    const requestBody = {
      model: "flux-pro", // или другая модель KIE
      prompt: prompt,
      negative_prompt: "text, watermark, signature, yellow background, modern, cartoon, anime, blurry, low quality, western style",
      width: 1024,
      height: 1024,
      steps: 25,
      guidance_scale: 7.5,
      num_inference_steps: 25,
      num_outputs: 1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`
    };

    const response = await axios.post(KIE_API_URL, requestBody, { 
      headers,
      timeout: 120000 // 2 минуты таймаут
    });

    console.log("   📊 Ответ KIE API получен");

    // 🔍 ОБРАБОТКА ОТВЕТА KIE API
    let imageUrl;
    
    if (response.data.data && response.data.data[0] && response.data.data[0].url) {
      // Формат: { data: [{ url: "..." }] }
      imageUrl = response.data.data[0].url;
    } else if (response.data.images && response.data.images[0]) {
      // Формат: { images: ["url_or_base64"] }
      imageUrl = response.data.images[0];
    } else if (response.data.url) {
      // Формат: { url: "..." }
      imageUrl = response.data.url;
    } else {
      console.log("   🔍 Структура ответа:", JSON.stringify(response.data).substring(0, 200));
      throw new Error("Неизвестный формат ответа KIE API");
    }

    // 💾 СКАЧИВАЕМ И СОХРАНЯЕМ ИЗОБРАЖЕНИЕ
    let imageBuffer;
    
    if (imageUrl.startsWith('http')) {
      // Это URL - скачиваем изображение
      const imageResponse = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: 60000
      });
      imageBuffer = imageResponse.data;
    } else {
      // Это base64 - декодируем
      imageBuffer = Buffer.from(imageUrl, 'base64');
    }

    const filePath = path.join(IMAGE_OUTPUT_DIR, `${filename}.png`);
    await fs.mkdir(IMAGE_OUTPUT_DIR, { recursive: true });
    await fs.writeFile(filePath, imageBuffer);
    
    console.log(`   ✅ Изображение сохранено: ${filePath}`);
    return filePath;

  } catch (error) {
    console.log(`   ❌ Ошибка KIE API: ${error.message}`);
    
    if (error.response) {
      console.log(`   📊 Статус: ${error.response.status}`);
      console.log(`   📝 Ответ: ${JSON.stringify(error.response.data)}`);
    }
    
    // Повторная попытка с упрощенным промптом
    if (attempt < 2) {
      console.log(`   🔄 Повторная попытка...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const simplifiedPrompt = prompt.replace(/complex|detailed|cinematic/g, "simple");
      return generateImageFromPrompt(simplifiedPrompt, filename, attempt + 1);
    }
    
    return null;
  }
}

// 🔍 ФУНКЦИЯ ДЛЯ ТЕСТИРОВАНИЯ KIE API
async function testKieAPI() {
  if (!KIE_API_KEY) {
    console.log("❌ KIE_API_KEY не настроен");
    return false;
  }

  try {
    console.log("🧪 Тестируем KIE API...");
    
    const testPrompt = "realistic photo 1:1, cinematic lighting, family dinner scene, emotional, Soviet apartment interior";
    
    const requestBody = {
      model: "flux-pro",
      prompt: testPrompt,
      width: 512,
      height: 512,
      num_outputs: 1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`
    };

    const response = await axios.post(KIE_API_URL, requestBody, { 
      headers,
      timeout: 30000 
    });

    console.log("✅ KIE API работает корректно");
    return true;
    
  } catch (error) {
    console.log(`❌ KIE API тест не пройден: ${error.message}`);
    return false;
  }
}

// ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТКИ СТАТЕЙ
async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("❌ Не найден ключ OpenAI API!");
      return;
    }

    // 🔍 ПРОВЕРЯЕМ KIE API ПЕРЕД НАЧАЛОМ
    const kieAvailable = await testKieAPI();
    
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
      { header: "Обложка", key: "cover", width: 20 },
      { header: "Статус", key: "status", width: 20 }
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let imagesGenerated = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обработка статьи ${i-1}: "${originalTitle.substring(0, 60)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      let regenCount = 0;
      let uniqueText = "";
      let coverStatus = kieAvailable ? "⏳ Ожидание" : "❌ API недоступен";

      try {
        // === 1. ГЕНЕРАЦИЯ ЗАГОЛОВКА ===
        console.log("   💡 Создаём новый заголовок...");
        const titlePrompt = `
Ты — копирайтер в стиле канала "MadeSimple" (Яндекс Дзен).
Создай эмоциональный, реалистичный заголовок в том же ритме и интонации.
Сохрани русскую атмосферу, без кликбейта и мотивационных штампов.

Оригинальный заголовок:
"${originalTitle}"

Верди только новый заголовок без кавычек.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 120
        });

        let uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, "").trim();
        totalInputTokens += titleResponse.usage.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage.completion_tokens || 0;

        // === 2. ГЕНЕРАЦИЯ ТЕКСТА (2-этапный рерайт) ===
        console.log("   ✍️ Переписываем первую половину...");
        const halfPrompt = `
Ты — профессиональный автор реалистичных рассказов для Яндекс Дзена.
Перепиши ПЕРВУЮ ПОЛОВИНУ этой истории в духе MadeSimple, сохранив ВЕСЬ сюжет и эмоции.
Пиши ПОДРОБНО, с внутренними монологами, диалогами и бытовыми деталями.
ОБЪЕМ ДОЛЖЕН БЫТЬ НЕ МЕНЕЕ 1500 СЛОВ. Не сокращай сцены!

Текст:
"""${originalText}"""

Верди только готовый текст первой половины без комментариев.
        `;

        const part1 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: halfPrompt }],
          temperature: 0.8,
          max_tokens: 8000
        });

        let part1Text = part1.choices[0].message.content.trim();
        totalInputTokens += part1.usage.prompt_tokens || 0;
        totalOutputTokens += part1.usage.completion_tokens || 0;

        console.log("   ✍️ Переписываем продолжение...");
        const continuePrompt = `
Продолжи этот рассказ с того момента, где закончилась предыдущая часть.
Сохрани стиль, интонацию и атмосферу. Заверши историю логично.
ОБЪЕМ ВТОРОЙ ЧАСТИ — НЕ МЕНЕЕ 1500 СЛОВ.
Вот первая часть:
"""${part1Text}"""
Теперь напиши продолжение.
        `;

        const part2 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: continuePrompt }],
          temperature: 0.8,
          max_tokens: 8000
        });

        let part2Text = part2.choices[0].message.content.trim();
        totalInputTokens += part2.usage.prompt_tokens || 0;
        totalOutputTokens += part2.usage.completion_tokens || 0;

        uniqueText = `${part1Text}\n\n${part2Text}`;

        // === ПРОВЕРКА ОБЪЕМА И ПЕРЕГЕНЕРАЦИЯ ===
        let finalWordCount = uniqueText.split(/\s+/).length;
        if (finalWordCount < 2500) {
          console.log("   ⚠️ Текст слишком короткий — выполняем перегенерацию...");
          regenCount++;
          const regenPrompt = `
Перепиши этот текст ПОДРОБНЕЕ, добавь внутренние мысли, диалоги и атмосферные детали.
ОБЪЕМ ДОЛЖЕН БЫТЬ НЕ МЕНЕЕ 3000 СЛОВ. Не меняй сюжет, сделай повествование насыщеннее.
"""${uniqueText}"""
          `;
          const regen = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: "user", content: regenPrompt }],
            temperature: 0.8,
            max_tokens: 8000
          });
          uniqueText = regen.choices[0].message.content.trim();
          totalInputTokens += regen.usage.prompt_tokens || 0;
          totalOutputTokens += regen.usage.completion_tokens || 0;
          finalWordCount = uniqueText.split(/\s+/).length;
        }

        // === 3. ГЕНЕРАЦИЯ ОБЛОЖКИ ЧЕРЕЗ KIE API ===
        if (kieAvailable) {
          console.log("   🎨 Создаём промпт для KIE API...");
          const imagePrompt = await generateImagePrompt(uniqueTitle, uniqueText);
          const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
          const imagePath = await generateImageFromPrompt(imagePrompt, `${i - 1}_${safeTitle}`);
          
          if (imagePath) {
            coverStatus = "✅ Создана";
            imagesGenerated++;
          } else {
            coverStatus = "❌ Ошибка";
          }
        }

        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 30 ? "✅ Сохранен" : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${finalWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);
        console.log(`   🔁 Перегенераций: ${regenCount}`);
        console.log(`   🖼️ Статус обложки: ${coverStatus}`);

        // === СОХРАНЕНИЕ РЕЗУЛЬТАТОВ ===
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
          cover: coverStatus,
          status: "✅ Готово"
        });

        // Сохранение текста
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, "utf8");

        processedCount++;
        await new Promise((resolve) => setTimeout(resolve, 3000));

      } catch (error) {
        console.log(`   ❌ Ошибка обработки: ${error.message}`);
      }
    }

    // === ФИНАЛЬНАЯ СТАТИСТИКА ===
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;
    const totalCost = inputCost + outputCost;

    await newWorkbook.xlsx.writeFile(outputPath);

    console.log("\n🎉 ====== ГОТОВО ======");
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`🖼️ Сгенерировано обложек: ${imagesGenerated}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log("💰 ====== РАСХОДЫ ======");
    console.log(`🔹 Входные токены: ${totalInputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})`);
    console.log(`🔹 Выходные токены: ${totalOutputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})`);
    console.log(`💵 Итого: ~$${totalCost.toFixed(4)}`);

  } catch (error) {
    console.error("💥 Критическая ошибка:", error.message);
  }
}

processArticles();// scripts/process-with-ai.js — версия для KIE API
const { OpenAI } = require("openai");
const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");
const axios = require("axios");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_MODEL = "gpt-4o";

// 🔑 KIE API НАСТРОЙКИ
const KIE_API_URL = "https://api.kie.ai/v1/images/generations";
const KIE_API_KEY = process.env.KIE_API_KEY; // Добавь этот секрет в GitHub
const IMAGE_OUTPUT_DIR = path.join(__dirname, "../processed/images");

console.log("🚀 Запускаем AI-обработку с KIE API для обложек...");

// Функция создания промпта для KIE API
async function generateImagePrompt(title, text) {
  const promptInstruction = `
Ты — сценарист для генерации изображений. Создай промпт для KIE API к статье в стиле Яндекс Дзен.
Требования к изображению:
- Реалистичная фотография, кинематографичное освещение
- Формат 1:1, яркие цвета, эмоциональная сцена
- Люди в кадре (не крупный план), естественные позы
- Советская/русская бытовая атмосфера 1980-1990х
- Эмоции: семейная драма, конфликт, бытовые отношения
- Без текста, без водяных знаков, без жёлтого фона

Основа для промпта:

Заголовок: "${title}"
Текст: """${text.substring(0, 800)}"""

Верди только английский промпт в формате:
"realistic photo 1:1, cinematic lighting, vivid colors, {детали сцены}, {эмоции}, {атмосфера}, Soviet/Russian style"
  `;

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: "user", content: promptInstruction }],
    temperature: 0.8,
    max_tokens: 300,
  });

  return response.choices[0].message.content.trim();
}

// Функция генерации изображения через KIE API
async function generateImageFromPrompt(prompt, filename, attempt = 1) {
  try {
    console.log(`   🎨 Генерация изображения через KIE API (попытка ${attempt})...`);
    console.log(`   📝 Промпт: ${prompt}`);

    // 📨 ЗАПРОС ДЛЯ KIE API
    const requestBody = {
      model: "flux-pro", // или другая модель KIE
      prompt: prompt,
      negative_prompt: "text, watermark, signature, yellow background, modern, cartoon, anime, blurry, low quality, western style",
      width: 1024,
      height: 1024,
      steps: 25,
      guidance_scale: 7.5,
      num_inference_steps: 25,
      num_outputs: 1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`
    };

    const response = await axios.post(KIE_API_URL, requestBody, { 
      headers,
      timeout: 120000 // 2 минуты таймаут
    });

    console.log("   📊 Ответ KIE API получен");

    // 🔍 ОБРАБОТКА ОТВЕТА KIE API
    let imageUrl;
    
    if (response.data.data && response.data.data[0] && response.data.data[0].url) {
      // Формат: { data: [{ url: "..." }] }
      imageUrl = response.data.data[0].url;
    } else if (response.data.images && response.data.images[0]) {
      // Формат: { images: ["url_or_base64"] }
      imageUrl = response.data.images[0];
    } else if (response.data.url) {
      // Формат: { url: "..." }
      imageUrl = response.data.url;
    } else {
      console.log("   🔍 Структура ответа:", JSON.stringify(response.data).substring(0, 200));
      throw new Error("Неизвестный формат ответа KIE API");
    }

    // 💾 СКАЧИВАЕМ И СОХРАНЯЕМ ИЗОБРАЖЕНИЕ
    let imageBuffer;
    
    if (imageUrl.startsWith('http')) {
      // Это URL - скачиваем изображение
      const imageResponse = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: 60000
      });
      imageBuffer = imageResponse.data;
    } else {
      // Это base64 - декодируем
      imageBuffer = Buffer.from(imageUrl, 'base64');
    }

    const filePath = path.join(IMAGE_OUTPUT_DIR, `${filename}.png`);
    await fs.mkdir(IMAGE_OUTPUT_DIR, { recursive: true });
    await fs.writeFile(filePath, imageBuffer);
    
    console.log(`   ✅ Изображение сохранено: ${filePath}`);
    return filePath;

  } catch (error) {
    console.log(`   ❌ Ошибка KIE API: ${error.message}`);
    
    if (error.response) {
      console.log(`   📊 Статус: ${error.response.status}`);
      console.log(`   📝 Ответ: ${JSON.stringify(error.response.data)}`);
    }
    
    // Повторная попытка с упрощенным промптом
    if (attempt < 2) {
      console.log(`   🔄 Повторная попытка...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const simplifiedPrompt = prompt.replace(/complex|detailed|cinematic/g, "simple");
      return generateImageFromPrompt(simplifiedPrompt, filename, attempt + 1);
    }
    
    return null;
  }
}

// 🔍 ФУНКЦИЯ ДЛЯ ТЕСТИРОВАНИЯ KIE API
async function testKieAPI() {
  if (!KIE_API_KEY) {
    console.log("❌ KIE_API_KEY не настроен");
    return false;
  }

  try {
    console.log("🧪 Тестируем KIE API...");
    
    const testPrompt = "realistic photo 1:1, cinematic lighting, family dinner scene, emotional, Soviet apartment interior";
    
    const requestBody = {
      model: "flux-pro",
      prompt: testPrompt,
      width: 512,
      height: 512,
      num_outputs: 1
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`
    };

    const response = await axios.post(KIE_API_URL, requestBody, { 
      headers,
      timeout: 30000 
    });

    console.log("✅ KIE API работает корректно");
    return true;
    
  } catch (error) {
    console.log(`❌ KIE API тест не пройден: ${error.message}`);
    return false;
  }
}

// ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТКИ СТАТЕЙ
async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("❌ Не найден ключ OpenAI API!");
      return;
    }

    // 🔍 ПРОВЕРЯЕМ KIE API ПЕРЕД НАЧАЛОМ
    const kieAvailable = await testKieAPI();
    
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
      { header: "Обложка", key: "cover", width: 20 },
      { header: "Статус", key: "status", width: 20 }
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let imagesGenerated = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обработка статьи ${i-1}: "${originalTitle.substring(0, 60)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      let regenCount = 0;
      let uniqueText = "";
      let coverStatus = kieAvailable ? "⏳ Ожидание" : "❌ API недоступен";

      try {
        // === 1. ГЕНЕРАЦИЯ ЗАГОЛОВКА ===
        console.log("   💡 Создаём новый заголовок...");
        const titlePrompt = `
Ты — копирайтер в стиле канала "MadeSimple" (Яндекс Дзен).
Создай эмоциональный, реалистичный заголовок в том же ритме и интонации.
Сохрани русскую атмосферу, без кликбейта и мотивационных штампов.

Оригинальный заголовок:
"${originalTitle}"

Верди только новый заголовок без кавычек.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 120
        });

        let uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, "").trim();
        totalInputTokens += titleResponse.usage.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage.completion_tokens || 0;

        // === 2. ГЕНЕРАЦИЯ ТЕКСТА (2-этапный рерайт) ===
        console.log("   ✍️ Переписываем первую половину...");
        const halfPrompt = `
Ты — профессиональный автор реалистичных рассказов для Яндекс Дзена.
Перепиши ПЕРВУЮ ПОЛОВИНУ этой истории в духе MadeSimple, сохранив ВЕСЬ сюжет и эмоции.
Пиши ПОДРОБНО, с внутренними монологами, диалогами и бытовыми деталями.
ОБЪЕМ ДОЛЖЕН БЫТЬ НЕ МЕНЕЕ 1500 СЛОВ. Не сокращай сцены!

Текст:
"""${originalText}"""

Верди только готовый текст первой половины без комментариев.
        `;

        const part1 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: halfPrompt }],
          temperature: 0.8,
          max_tokens: 8000
        });

        let part1Text = part1.choices[0].message.content.trim();
        totalInputTokens += part1.usage.prompt_tokens || 0;
        totalOutputTokens += part1.usage.completion_tokens || 0;

        console.log("   ✍️ Переписываем продолжение...");
        const continuePrompt = `
Продолжи этот рассказ с того момента, где закончилась предыдущая часть.
Сохрани стиль, интонацию и атмосферу. Заверши историю логично.
ОБЪЕМ ВТОРОЙ ЧАСТИ — НЕ МЕНЕЕ 1500 СЛОВ.
Вот первая часть:
"""${part1Text}"""
Теперь напиши продолжение.
        `;

        const part2 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: continuePrompt }],
          temperature: 0.8,
          max_tokens: 8000
        });

        let part2Text = part2.choices[0].message.content.trim();
        totalInputTokens += part2.usage.prompt_tokens || 0;
        totalOutputTokens += part2.usage.completion_tokens || 0;

        uniqueText = `${part1Text}\n\n${part2Text}`;

        // === ПРОВЕРКА ОБЪЕМА И ПЕРЕГЕНЕРАЦИЯ ===
        let finalWordCount = uniqueText.split(/\s+/).length;
        if (finalWordCount < 2500) {
          console.log("   ⚠️ Текст слишком короткий — выполняем перегенерацию...");
          regenCount++;
          const regenPrompt = `
Перепиши этот текст ПОДРОБНЕЕ, добавь внутренние мысли, диалоги и атмосферные детали.
ОБЪЕМ ДОЛЖЕН БЫТЬ НЕ МЕНЕЕ 3000 СЛОВ. Не меняй сюжет, сделай повествование насыщеннее.
"""${uniqueText}"""
          `;
          const regen = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: "user", content: regenPrompt }],
            temperature: 0.8,
            max_tokens: 8000
          });
          uniqueText = regen.choices[0].message.content.trim();
          totalInputTokens += regen.usage.prompt_tokens || 0;
          totalOutputTokens += regen.usage.completion_tokens || 0;
          finalWordCount = uniqueText.split(/\s+/).length;
        }

        // === 3. ГЕНЕРАЦИЯ ОБЛОЖКИ ЧЕРЕЗ KIE API ===
        if (kieAvailable) {
          console.log("   🎨 Создаём промпт для KIE API...");
          const imagePrompt = await generateImagePrompt(uniqueTitle, uniqueText);
          const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
          const imagePath = await generateImageFromPrompt(imagePrompt, `${i - 1}_${safeTitle}`);
          
          if (imagePath) {
            coverStatus = "✅ Создана";
            imagesGenerated++;
          } else {
            coverStatus = "❌ Ошибка";
          }
        }

        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 30 ? "✅ Сохранен" : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${finalWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);
        console.log(`   🔁 Перегенераций: ${regenCount}`);
        console.log(`   🖼️ Статус обложки: ${coverStatus}`);

        // === СОХРАНЕНИЕ РЕЗУЛЬТАТОВ ===
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
          cover: coverStatus,
          status: "✅ Готово"
        });

        // Сохранение текста
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, "");
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, "utf8");

        processedCount++;
        await new Promise((resolve) => setTimeout(resolve, 3000));

      } catch (error) {
        console.log(`   ❌ Ошибка обработки: ${error.message}`);
      }
    }

    // === ФИНАЛЬНАЯ СТАТИСТИКА ===
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;
    const totalCost = inputCost + outputCost;

    await newWorkbook.xlsx.writeFile(outputPath);

    console.log("\n🎉 ====== ГОТОВО ======");
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`🖼️ Сгенерировано обложек: ${imagesGenerated}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log("💰 ====== РАСХОДЫ ======");
    console.log(`🔹 Входные токены: ${totalInputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})`);
    console.log(`🔹 Выходные токены: ${totalOutputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})`);
    console.log(`💵 Итого: ~$${totalCost.toFixed(4)}`);

  } catch (error) {
    console.error("💥 Критическая ошибка:", error.message);
  }
}

processArticles();