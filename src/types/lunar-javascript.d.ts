/** lunar-javascript 没有自带类型声明，这里只声明本项目用到的部分。 */
declare module 'lunar-javascript' {
  export interface LunarDate {
    getYearInGanZhi(): string;
    getYearShengXiao(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getJieQi(): string;
    getFestivals(): string[];
    getOtherFestivals(): string[];
  }

  export interface SolarDate {
    getLunar(): LunarDate;
    getFestivals(): string[];
    getOtherFestivals(): string[];
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate;
    fromDate(date: Date): SolarDate;
  };

  export const Lunar: {
    fromYmd(year: number, month: number, day: number): LunarDate;
    fromDate(date: Date): LunarDate;
  };
}
