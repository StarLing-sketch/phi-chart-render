import Judgement from './judgement';
import { Application, Container, Texture, Sprite, Graphics, Text, Rectangle } from 'pixi.js-legacy';

const ProgressBarCache = (() =>
{
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 1920;
    canvas.height = 12;
    ctx.clearRect(0, 0, 1920, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 1920, 12);

    const result = Texture.from(canvas);
    Texture.addToCache(result, 'progressBar');

    return result;
})();

/**
  * {
  *     render: {
  *         width?,
  *         height?,
  *         resolution?,
  *         autoDensity?,
  *         antialias?,
  *         forceCanvas?,
  *         view?,
  *         resizeTo?
  *     },
  *     chart,
  *     assets,
  *     zipFiles?,
  *     watermark?,
  *     settings: {
  *         audioOffset?,
  *         hitsound?,
  *         hitsoundVolume?,
  *         speed?,
  *         noteScale?,
  *         bgDim?,
  *         multiNoteHL?,
  *         showInputPoint?,
  *         challengeMode?,
  *         autoPlay?,
  *         forceCanvas?,
  *         debug?
  *     }
  * }
 **/
export default class Game
{
    constructor(params)
    {
        /* ===== 加载谱面基本信息 ===== */
        this.chart    = params.chart;
        this.assets   = params.assets;
        this.zipFiles = params.zipFiles;

        if (!this.chart) throw new Error('You must select a chart to play');
        if (!this.assets) throw new Error('Render must use a texture object for creating sprites.');
        if (!this.zipFiles) this.zipFiles = {};

       /* ===== 创建 render ===== */
        this.render = new Application({
            width           : !isNaN(Number(params.render.width)) ? Number(params.render.width) : document.documentElement.clientWidth,
            height          : !isNaN(Number(params.render.height)) ? Number(params.render.height) : document.documentElement.clientHeight,
            resolution      : !isNaN(Number(params.render.resolution)) ? Number(params.render.resolution) : window.devicePixelRatio,
            autoDensity     : params.render.autoDensity !== undefined && params.settings.autoDensity !== null ? !!params.render.autoDensity : true,
            antialias       : params.render.antialias !== undefined && params.render.antialias !== null ? !!params.render.antialias : true,
            forceCanvas     : params.render.forceCanvas !== undefined && params.render.forceCanvas !== null ? !!params.render.forceCanvas : false,
            view            : params.render.canvas ? params.render.canvas : undefined,
            backgroundAlpha : 1
        });
        this.render.parentNode = params.render.resizeTo ? params.render.resizeTo : (params.render.canvas ? params.render.canvas.parentNode : this.render.view.parentElement);

        // 创建舞台主渲染区
        this.render.mainContainer = new Container();
        this.render.mainContainer.zIndex = 10;
        this.render.stage.addChild(this.render.mainContainer);

        // 创建舞台主渲染区可见范围
        this.render.mainContainerMask = new Graphics();
        this.render.mainContainerMask.cacheAsBitmap = true;

        /* ===== 创建判定 ===== */
        this.judgement = new Judgement({
            chart          : this.chart,
            stage          : this.render.mainContainer,
            canvas         : this.render.view,
            assets         : {
                textures : { normal: this.assets.textures.clickRaw, bad: this.assets.textures.clickRaw },
                sounds   : {
                    tap   : this.assets.sounds.tap,
                    drag  : this.assets.sounds.drag,
                    flick : this.assets.sounds.flick
                },
            },
            hitsound       : params.settings && params.settings.hitsound !== undefined && params.settings.hitsound !== null ? !!params.settings.hitsound : true,
            hitsoundVolume : params.settings && !isNaN(Number(params.settings.hitsoundVolume)) ? Number(params.settings.hitsoundVolume) : 1,
            showAPStatus   : params.settings && params.settings.showAPStatus !== undefined && params.settings.showAPStatus !== null ? !!params.settings.showAPStatus : true,
            challengeMode  : params.settings && params.settings.challengeMode !== undefined && params.settings.challengeMode !== null ? !!params.settings.challengeMode : false,
            autoPlay       : params.settings && params.settings.autoPlay !== undefined && params.settings.autoPlay !== null ? !!params.settings.autoPlay : false
        });

        this.sprites = {};
        this.functions = {
            start: [],
            pause: [],
            end: []
        };

        /* ===== 用户设置暂存 ===== */
        this._settings = {};
        this._settings.noteScale      = params.settings && !isNaN(Number(params.settings.noteScale)) ? Number(params.settings.noteScale) : 8000;
        this._settings.bgDim          = params.settings && !isNaN((Number(params.settings.bgDim))) ? Number(params.settings.bgDim) : 0.5;
        this._settings.offset         = params.settings && !isNaN(Number(params.settings.audioOffset)) ? Number(params.settings.audioOffset) : 0;
        this._settings.speed          = params.settings && !isNaN(Number(params.settings.speed)) ? Number(params.settings.speed) : 1;
        this._settings.showFPS        = params.settings && params.settings.showFPS !== undefined && params.settings.showFPS !== null ? !!params.settings.showFPS : true;
        this._settings.showInputPoint = params.settings && params.settings.showInputPoint !== undefined && params.settings.showInputPoint !== null ? !!params.settings.showInputPoint : true;
        this._settings.multiNoteHL    = params.settings && params.settings.multiNoteHL !== undefined && params.settings.multiNoteHL !== null ? !!params.settings.multiNoteHL : true;
        this._settings.showAPStatus   = params.settings && params.settings.showAPStatus !== undefined && params.settings.showAPStatus !== null ? !!params.settings.showAPStatus : true;
        this._settings.challengeMode  = params.settings && params.settings.challengeMode !== undefined && params.settings.challengeMode !== null ? !!params.settings.challengeMode : false;
        this._settings.debug          = params.settings && params.settings.debug ? !!params.settings.debug : false;

        this._watermarkText = params.watermark && params.watermark != '' ? params.watermark : 'github/MisaLiu/phi-chart-render';

        this._musicId = null;
        this._audioOffset = 0;
        this._animateStatus = NaN;
        this._gameStartTime = NaN;
        this._gameEndTime   = NaN;
        this._isPaused = false;
        this._isEnded = false;

        this.resize = this.resize.bind(this);
        this._pauseBtnClickCallback = this._pauseBtnClickCallback.bind(this);
        this._calcTick = this._calcTick.bind(this);
        this._gameEndCallback = this._gameEndCallback.bind(this);

        if (this._settings.speed < 0.25) throw new Error('Speed too slow');
        else if (this._settings.speed > 2) throw new Error('Speed too fast');

        this.resize(false);
        window.addEventListener('resize', this.resize);
    }

    createSprites()
    {
        if (this.chart.bg)
        { // 创建超宽屏舞台覆盖
            this.render.mainContainerCover = new Sprite(this.chart.bg);
            let bgCover = new Graphics();

            bgCover.beginFill(0x000000);
            bgCover.drawRect(0, 0, this.render.mainContainerCover.texture.width, this.render.mainContainerCover.texture.height);
            bgCover.endFill();

            bgCover.position.x = -this.render.mainContainerCover.width / 2;
            bgCover.position.y = -this.render.mainContainerCover.height / 2;
            bgCover.alpha = 0.5;

            this.render.mainContainerCover.zIndex = 1;
            this.render.mainContainerCover.addChild(bgCover);
            this.render.mainContainerCover.anchor.set(0.5);

            this.render.stage.addChild(this.render.mainContainerCover);
        }

        this.chart.createSprites(
            this.render.mainContainer,
            this.render.sizer,
            this.assets.textures,
            this.zipFiles,
            this._settings.speed,
            this._settings.bgDim,
            this._settings.multiNoteHL,
            this._settings.debug
        );
        
        if (this._settings.showAPStatus)
        {
            for (const judgeline of this.chart.judgelines)
            {
                if (!judgeline.sprite) continue;
                judgeline.sprite.tint = 0xFFECA0;
            };
        }

        this.chart.music.rate(this._settings.speed);
        this.chart.music.on('end', this._gameEndCallback);

        this.judgement.stage = this.render.mainContainer;
        this.judgement.createSprites(this._settings.showInputPoint);

        // 进度条
        this.sprites.progressBar = new Sprite(ProgressBarCache);
        this.sprites.progressBar.width = 0;
        this.sprites.progressBar.alpha = 0.75;
        this.sprites.progressBar.zIndex = 99999;
        this.render.mainContainer.addChild(this.sprites.progressBar);

        // 暂停按钮
        this.sprites.pauseButton = new Sprite(this.assets.textures.pauseButton);

        this.sprites.pauseButton.interactive = true;
        this.sprites.pauseButton.buttonMode = true;
        this.sprites.pauseButton.on('pointerdown', this._pauseBtnClickCallback);

        this.sprites.pauseButton.hitArea = new Rectangle(
            -(this.sprites.pauseButton.texture.width * 1.5),
            -(this.sprites.pauseButton.texture.height / 2),
            this.sprites.pauseButton.texture.width * 2,
            this.sprites.pauseButton.texture.height * 2
        );
        this.sprites.pauseButton.clickCount = 0;
        this.sprites.pauseButton.lastClickTime = Date.now();
        this.sprites.pauseButton.isEndRendering = false;
        this.sprites.pauseButton.lastRenderTime = Date.now();

        this.sprites.pauseButton.anchor.set(1, 0);
        this.sprites.pauseButton.alpha = 0.5;
        this.sprites.pauseButton.zIndex = 99999;
        this.render.mainContainer.addChild(this.sprites.pauseButton);

        // 假判定线，过场动画用
        this.sprites.fakeJudgeline = new Sprite(this.assets.textures.judgeline);
        this.sprites.fakeJudgeline.anchor.set(0.5);
        this.sprites.fakeJudgeline.zIndex = 99999;
        if (this._settings.showAPStatus) this.sprites.fakeJudgeline.tint = 0xFFECA0;
        this.render.mainContainer.addChild(this.sprites.fakeJudgeline);

        if (this._settings.showFPS)
        {
            this.render.fpsText = new Text('FPS: 0', {
                fontFamily: 'MiSans',
                align: 'right',
                fill: 0xFFFFFF
            });
            this.render.fpsText.anchor.x = 1;
            this.render.fpsText.alpha = 0.5;
            this.render.fpsText.zIndex = 999999;

            this.render.mainContainer.addChild(this.render.fpsText);
        }

        this.render.watermark = new Text(this._watermarkText, {
            fontFamily: 'MiSans',
            align: 'right',
            fill: 0xFFFFFF
        });
        this.render.watermark.anchor.set(1);
        this.render.watermark.alpha = 0.5;
        this.render.watermark.zIndex = 999999;
        this.render.mainContainer.addChild(this.render.watermark);

        this.render.mainContainer.sortChildren();
        this.render.stage.sortChildren();

        // 预播放 hitsound，也许能减轻打击未打击过的某类 note 时的卡顿问题？
        for (const name in this.judgement.sounds)
        {
            this.judgement.sounds[name].load();
            /*
            this.judgement.sounds[name].volume(0);
            this.judgement.sounds[name].play();
            */
        }
    }

    start()
    {
        if (!this.render) return;
        if (!this.chart.music) throw new Error('You must have a music to play');
        if (this._musicId) throw new Error('You have already started');

        this.resize();

        if (this.render.fpsText)
        {
            this.render.fpsCounter = setInterval(() =>
            {
                this.render.fpsText.text = 'FPS: ' + (this.render.ticker.FPS).toFixed(0);
            }, 500);
        }

        this._animateStatus = 0;
        this._gameStartTime = Date.now();

        this.chart.noteJudgeCallback = this.judgement.calcNote;
        this.render.ticker.add(this._calcTick);

        this.chart.calcTime(0);
        for (const judgeline of this.chart.judgelines)
        {
            if (!judgeline.sprite) continue;

            judgeline.sprite.alpha = 0;
            if (judgeline.debugSprite) judgeline.debugSprite.visible = false;
        };
        for (const note of this.chart.notes)
        {
            if (!note.sprite) continue;

            note.sprite.alpha = 0;
            if (note.debugSprite) note.debugSprite.visible = false;
            if (note.hitsound) note.hitsound.volume(this.judgement._hitsoundVolume);
        };

        this.judgement.createClickAnimate({
            type: 1,
            score: 3,
            sprite: {
                position: {
                    x: -200,
                    y: -200
                },
                angle: 180,
                judgelineX: -200,
                judgelineY: -200
            }
        });

        for (const name in this.judgement.sounds)
        {
            this.judgement.sounds[name].volume(this.judgement._hitsoundVolume);
        }
    }

    pause()
    {
        this._isPaused = !this._isPaused;
        this.judgement.input._isPaused = this._isPaused;

        if (!this._musicId) return;
        if (this._isPaused)
        {
            this.chart.music.pause();
            this._runCallback('pause');
        }
        else
        {
            this.chart.music.play(this._musicId);
        }
    }

    restart()
    {
        if (!this._musicId) return;

        this.render.ticker.remove(this._calcTick);
        this.chart.music.stop();
        this._musicId = null;

        this.chart.reset();
        this.judgement.reset();

        this.resize();
        this.chart.calcTime(0);

        this._isPaused = false;
        this._isEnded = false;

        this._animateStatus = 0;
        this._gameStartTime = Date.now();
        this._gameEndTime   = NaN;

        this.render.ticker.add(this._calcTick);
        if (this._settings.showAPStatus) this.sprites.fakeJudgeline.tint = 0xFFECA0;
        this.sprites.fakeJudgeline.visible = true;

        for (const judgeline of this.chart.judgelines)
        {
            if (!judgeline.sprite) continue;

            judgeline.sprite.alpha = 0;
            if (this._settings.showAPStatus) judgeline.sprite.tint = 0xFFECA0;
            if (judgeline.debugSprite) judgeline.debugSprite.visible = false;
        };
        for (const note of this.chart.notes)
        {
            if (!note.sprite) continue;

            note.sprite.alpha = 0;
            if (note.debugSprite) note.debugSprite.visible = false;
        };
    }

    destroy(removeCanvas = false)
    {
        const canvas = this.render.view;

        this.render.ticker.remove(this._calcTick);
        this.chart.music.stop();

        if (this.render.fpsText) clearInterval(this.render.fpsCounter);

        this.chart.reset();
        this.chart.destroySprites();
        this.judgement.destroySprites();

        this.judgement.input.removeListenerFromCanvas(canvas);
        window.removeEventListener('resize', this.resize);

        canvas.width = canvas.height = 0;

        this.render.destroy(removeCanvas, { children: true, texture: false, baseTexture: false });
    }

    _pauseBtnClickCallback()
    {
        let pauseButton = this.sprites.pauseButton;
        pauseButton.clickCount++;
        if (pauseButton.clickCount >= 2 && Date.now() - pauseButton.lastClickTime <= 2000)
        {
            this.pause();

            pauseButton.lastRenderTime = Date.now();
            pauseButton.isEndRendering = true;
            pauseButton.clickCount = 0;
        }
        pauseButton.lastClickTime = Date.now();
    }

    _calcTick()
    {
        { // 为暂停按钮计算渐变
            let pauseButton = this.sprites.pauseButton;
            if (pauseButton.clickCount === 1)
            {
                if (pauseButton.alpha < 1)
                { // 按钮刚被点击一次
                    pauseButton.alpha = 0.5 + (0.5 * ((Date.now() - pauseButton.lastClickTime) / 200));
                }
                else if (pauseButton.alpha >= 1 && Date.now() - pauseButton.lastClickTime >= 2000)
                { // 按钮刚被点击一次，且 2s 后没有进一步操作
                    pauseButton.clickCount = 0;
                    pauseButton.lastRenderTime = Date.now();
                    pauseButton.isEndRendering = true;
                }
                else if (pauseButton.alpha >= 1)
                { // 按钮被点击一次，且 200ms 后不透明度已到 1
                    pauseButton.alpha = 1;
                    pauseButton.lastRenderTime = Date.now();
                }
            }
            else if (pauseButton.clickCount === 0 && pauseButton.isEndRendering)
            {
                if (pauseButton.alpha > 0.5)
                {
                    pauseButton.alpha = 1 - (0.5 * ((Date.now() - pauseButton.lastRenderTime) / 200));
                }
                else if (pauseButton.alpha <= 0.5)
                {
                    pauseButton.alpha = 0.5;
                    pauseButton.lastRenderTime = Date.now();
                    pauseButton.isEndRendering = false;
                }
            }
        }

        switch (this._animateStatus)
        {
            case 0:
            {
                this._calcGameAnimateTick(true);
                break;
            }
            case 1:
            {
                let currentTime = (this.chart.music.seek() || 0) - this.chart.offset + this._settings.offset;
                currentTime = currentTime > 0 ? currentTime : 0;

                this.chart.calcTime(currentTime);
                if (!this._isPaused) this.judgement.calcTick();

                this.sprites.progressBar.width = ((this.chart.music.seek() || 0) / this.chart.music._duration) * this.render.sizer.width;
                break;
            }
            case 2:
            {
                this._calcGameAnimateTick(false);
                break;
            }
            case 3:
            {
                break;
            }
        }
    }

    _calcGameAnimateTick(isStart = true)
    {
        let _progress = (Date.now() - (isStart ? this._gameStartTime : this._gameEndTime)) / 1500,
            progress = (isStart ? 1 - Math.pow(1 - _progress, 4) : Math.pow(1 - _progress, 4));
        let sprites = {
            score: this.judgement.score.sprites,
            chart: this.chart.sprites
        };

        // Combo、准度、分数、暂停按钮和进度条
        sprites.score.combo.container.position.y = -(sprites.score.combo.container.height + sprites.score.acc.height) + ((sprites.score.combo.container.height + sprites.score.acc.height + (this.render.sizer.heightPercent * 41)) * progress);
        sprites.score.acc.position.y = sprites.score.combo.container.position.y + (this.render.sizer.heightPercent * 72);
        sprites.score.score.position.y = -(sprites.score.score.height) + ((sprites.score.score.height + (this.render.sizer.heightPercent * 61)) * progress);
        this.sprites.pauseButton.position.y = -(this.sprites.pauseButton.height) + ((this.sprites.pauseButton.height + (this.render.sizer.heightPercent * (61 + 14))) * progress);
        this.sprites.progressBar.position.y = -(this.render.sizer.heightPercent * 12) * (1 - progress);

        // 谱面信息
        sprites.chart.info.songName.position.y = (this.render.sizer.height + sprites.chart.info.songName.height) - ((sprites.chart.info.songName.height + (this.render.sizer.heightPercent * 66)) * progress);
        sprites.chart.info.songDiff.position.y = sprites.chart.info.songName.position.y + (this.render.sizer.heightPercent * 24);

        // 假判定线过场动画
        this.sprites.fakeJudgeline.width = this.render.sizer.width * progress;

        // 背景图亮度
        if (this.chart.sprites.bg && this.chart.sprites.bg.cover) this.chart.sprites.bg.cover.alpha = this._settings.bgDim * progress;

        if (_progress >= 1)
        {
            if (isStart)
            {
                this._animateStatus = 1;
                this.resize(true, false);

                setTimeout(async () =>
                {
                    this._musicId = this.chart.music.play();

                    for (const judgeline of this.chart.judgelines)
                    {
                        if (!judgeline.sprite) continue;

                        judgeline.sprite.alpha = 1;
                        if (judgeline.debugSprite) judgeline.debugSprite.visible = true;
                    };
                    for (const note of this.chart.notes)
                    {
                        if (note.sprite) note.sprite.alpha = note.basicAlpha;
                    };

                    this._isPaused = false;
                    this._isEnded = false;
                    this.sprites.fakeJudgeline.visible = false;

                    this._runCallback('start');
                }, 200);
            }
            else
            {
                this._animateStatus = 3;
                this._isPaused = true;
                this._isEnded = true;
                this._runCallback('end');
            }
        }
    }

    _gameEndCallback()
    {
        this._animateStatus = 2;
        this._gameEndTime = Date.now();
        this.sprites.fakeJudgeline.visible = true;
        if (this._settings.showAPStatus)
        {
            if (this.judgement.score.APType === 1) this.sprites.fakeJudgeline.tint = 0xB4E1FF;
            else if (this.judgement.score.APType === 0) this.sprites.fakeJudgeline.tint = 0xFFFFFF;
        }
        
        for (const judgeline of this.chart.judgelines)
        {
            if (!judgeline.sprite) continue;

            judgeline.sprite.alpha = 0;
            if (judgeline.debugSprite) judgeline.debugSprite.visible = false;
        };
        for (const note of this.chart.notes)
        {
            if (!note.sprite) continue;

            note.sprite.alpha = 0;
            if (note.debugSprite) note.debugSprite.visible = false;
        };

        if (this.judgement.input.sprite) this.judgement.input.sprite.clear();
    }

    on(type, callback)
    {
        if (!this.functions[type]) return;
        if (!(callback instanceof Function)) return;
        this.functions[type].push(callback);
    }

    _runCallback(type)
    {
        if (!this.functions[type]) return;
        this.functions[type].forEach((callback) => callback(this));
    }

    resize(withChartSprites = true, shouldResetFakeJudgeLine = true)
    {
        if (!this.render) return;

        this.render.renderer.resize(this.render.parentNode.clientWidth, this.render.parentNode.clientHeight);

        // 计算新尺寸相关数据
        this.render.sizer = calcResizer(this.render.screen.width, this.render.screen.height, this._settings.noteScale);

        // 主舞台区位置重计算
        this.render.mainContainer.position.x = this.render.sizer.widthOffset;
        // 主舞台可视区域计算
        if (this.render.sizer.widerScreen && this.render.mainContainer)
        {
            this.render.mainContainer.mask = this.render.mainContainerMask;
            this.render.mainContainerMask.visible = true;

            this.render.mainContainerMask.clear()
                .beginFill(0xFFFFFF)
                .drawRect(this.render.sizer.widthOffset, 0, this.render.sizer.width, this.render.sizer.height)
                .endFill();
        }
        else
        {
            this.render.mainContainer.mask = null;
            this.render.mainContainerMask.visible = false;
        }
        // 主舞台超宽屏覆盖计算
        if (this.render.sizer.widerScreen && this.render.mainContainerCover)
        {
            let bgScaleWidth = this.render.screen.width / this.render.mainContainerCover.texture.width;
            let bgScaleHeight = this.render.screen.height / this.render.mainContainerCover.texture.height;
            let bgScale = bgScaleWidth > bgScaleHeight ? bgScaleWidth : bgScaleHeight;

            this.render.mainContainerCover.scale.set(bgScale);
            this.render.mainContainerCover.position.set(this.render.screen.width / 2, this.render.screen.height / 2);

            this.render.mainContainerCover.visible = true;
        }
        else if (this.render.mainContainerCover)
        {
            this.render.mainContainerCover.visible = false;
        }

        if (!this._isEnded && this.sprites)
        {
            if (this.sprites.progressBar)
            {
                this.sprites.progressBar.position.set(0, 0);
                this.sprites.progressBar.scale.y = this.render.sizer.heightPercent;
                this.sprites.progressBar.width = this._music ? this._music.progress * this.render.sizer.width : 0;
            }

            if (this.sprites.pauseButton)
            {
                this.sprites.pauseButton.position.x = this.render.sizer.width - this.render.sizer.heightPercent * 72;
                this.sprites.pauseButton.position.y = this.render.sizer.heightPercent * (61 + 14);
                this.sprites.pauseButton.scale.set(0.94 * this.render.sizer.heightPercent);
            }

            if (this.sprites.fakeJudgeline)
            {
                this.sprites.fakeJudgeline.position.x = this.render.sizer.width / 2;
                this.sprites.fakeJudgeline.position.y = this.render.sizer.height / 2;

                this.sprites.fakeJudgeline.height = this.render.sizer.lineScale * 18.75 * 0.008;
                if (shouldResetFakeJudgeLine || this._isEnded)
                {
                    this.sprites.fakeJudgeline.width = 0;
                }
            }
        }

        // FPS 计数器尺寸计算
        if (this.render.fpsText)
        {
            this.render.fpsText.position.x     = this.render.sizer.width;
            this.render.fpsText.position.y     = 0;
            this.render.fpsText.style.fontSize = this.render.sizer.heightPercent * 32;
            this.render.fpsText.style.padding  = this.render.sizer.heightPercent * 8;
        }

        if (this.render.watermark)
        {
            this.render.watermark.position.x     = this.render.sizer.width;
            this.render.watermark.position.y     = this.render.sizer.height;
            this.render.watermark.style.fontSize = this.render.sizer.heightPercent * 20;
        }
        
        if (withChartSprites)
        {
            this.judgement.resizeSprites(this.render.sizer, this._isEnded);
            this.chart.resizeSprites(this.render.sizer, this._isEnded);
        }
    }
}

function calcResizer(width, height, noteScale = 8000)
{
    let result = {};

    result.width  = height / 9 * 16 < width ? height / 9 * 16 : width;
    result.height = height;
    result.widthPercent = result.width * (9 / 160);
    result.widthOffset  = (width - result.width) / 2;

    result.widerScreen = result.width < width ? true : false;

    result.startX = -result.width / 6;
    result.endX   = result.width + result.width / 6;
    result.startY = -result.height / 6;
    result.endY   = result.height + result.height / 6;

    result.noteSpeed     = result.height * 0.6;
    result.noteScale     = result.width / noteScale;
    result.noteWidth     = result.width * 0.117775;
    result.lineScale     = result.width > result.height * 0.75 ? result.height / 18.75 : result.width / 14.0625;
    result.heightPercent = result.height / 1080; 
    /*var divisor = aliquot(width, height); //获整除数
    var i = (width / divisor) * (height / divisor);
    switch(i)
    {
        case 144:
            i *= 0.01; break;
        case 12:
            i *= 0.105; break;//0.106f
        default:
            i *= 0.01;
    }*/
    result.LineheightPercent = result.height / 750;//i;
    return result;
}
function aliquot(width, height)
{
    if (width % height == 0) return height;
    return aliquot(height, width % height);
}
