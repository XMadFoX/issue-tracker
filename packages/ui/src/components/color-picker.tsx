"use client";

// https://github.com/vatsalpipalava/shadcn-input-color/blob/main/src/components/input-color.tsx
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { HexColorPicker, HexAlphaColorPicker } from "react-colorful";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Input } from "./input";
import { Label } from "./label";
import { Loader2, PipetteIcon } from "lucide-react";
import { useState, useEffect } from "react";
import Color from "color";
import { z } from "zod";
import { cn } from "@/lib/utils";

export const colorSchema = z
  .string()
  .regex(
    /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/,
    "Color must be a valid hex color (e.g., #FF0000 or #FF0000FF)"
  )
  .transform((val) => val.toUpperCase());

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  isLoading?: boolean;
  label?: string;
  error?: string;
  className?: string;
  alpha?: boolean;
  trigger?: React.ReactNode;
  showControls?: boolean;
}

interface ColorValues {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  rgba?: { r: number; g: number; b: number; a: number };
  hsla?: { h: number; s: number; l: number; a: number };
}

export default function InputColor({
  value,
  onChange,
  onBlur,
  isLoading = false,
  label,
  error,
  className,
  alpha = false,
  trigger,
  showControls = true,
}: ColorPickerProps) {
  const [colorFormat, setColorFormat] = useState(alpha ? "HEXA" : "HEX");
  const [colorValues, setColorValues] = useState<ColorValues>(() => {
    const color = Color(value);
    const rgb = color.rgb().array();
    const hsl = color.hsl().array();
    const a = color.alpha();
    if (alpha) {
      return {
        hex: value.length === 9 ? value.slice(0, 7) : value,
        rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
        hsl: { h: hsl[0], s: hsl[1], l: hsl[2] },
        rgba: { r: rgb[0], g: rgb[1], b: rgb[2], a },
        hsla: { h: hsl[0], s: hsl[1], l: hsl[2], a },
      };
    } else {
      return {
        hex: value,
        rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
        hsl: { h: hsl[0], s: hsl[1], l: hsl[2] },
      };
    }
  });
  // Add a state to store the current HEX/HEXA input value
  const [hexInputValue, setHexInputValue] = useState(value);
  const [hexInputError, setHexInputError] = useState<string | null>(null);

  // Update all color formats when color changes
  const updateColorValues = (newColor: string) => {
    const color = Color(newColor);
    const rgb = color.rgb().array();
    const hsl = color.hsl().array();
    const a = color.alpha();
    if (alpha) {
      setColorValues({
        hex: newColor.length === 9 ? newColor.slice(0, 7) : newColor,
        rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
        hsl: { h: hsl[0], s: hsl[1], l: hsl[2] },
        rgba: { r: rgb[0], g: rgb[1], b: rgb[2], a },
        hsla: { h: hsl[0], s: hsl[1], l: hsl[2], a },
      });
      setHexInputValue(newColor.toUpperCase());
    } else {
      setColorValues({
        hex: newColor.toUpperCase(),
        rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
        hsl: { h: hsl[0], s: hsl[1], l: hsl[2] },
      });
      setHexInputValue(newColor.toUpperCase());
    }
  };

  // Handle color picker change
  const handleColorChange = (newColor: string) => {
    updateColorValues(newColor);
    onChange(newColor);
  };

  // Handle HEX input change
  const handleHexChange = (value: string) => {
    let formattedValue = value.toUpperCase();
    if (!formattedValue.startsWith("#")) {
      formattedValue = "#" + formattedValue;
    }

    const maxLength = alpha ? 9 : 7;
    if (
      formattedValue.length <= maxLength &&
      /^#[0-9A-Fa-f]*$/.test(formattedValue)
    ) {
      setHexInputValue(formattedValue); // Always update the input value
      // Update color and color values for any valid partial hex
      onChange(formattedValue);
      updateColorValues(formattedValue);
      try {
        if (formattedValue.length === maxLength) {
          // Only validate when full length
          colorSchema.parse(formattedValue);
          // Already updated above
          setHexInputError(null);
        } else {
          // Not full length, so log
          console.log("Enter a valid color");
          setHexInputError("Enter a valid color");
        }
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          // Do not update color, just keep the input value
          console.log("Enter a valid color");
          setHexInputError("Enter a valid color");
        }
      }
    }
  };

  // Handle RGB input change
  const handleRgbChange = (component: "r" | "g" | "b", value: string) => {
    const numValue = Number.parseInt(value) || 0;
    const clampedValue = Math.max(0, Math.min(255, numValue));
    const newRgb = { ...colorValues.rgb, [component]: clampedValue };
    const hex = Color(newRgb).hex();
    const hslArray = Color(newRgb).hsl().array();

    setColorValues({
      ...colorValues,
      hex,
      rgb: newRgb,
      hsl: { h: hslArray[0], s: hslArray[1], l: hslArray[2] },
    });
    onChange(hex);
  };

  // Handle RGBA input change
  const handleRgbaChange = (
    component: "r" | "g" | "b" | "a",
    value: string
  ) => {
    if (!alpha || !colorValues.rgba) return;

    const numValue = Number.parseFloat(value) || 0;
    let clampedValue;

    if (component === "a") {
      clampedValue = Math.max(0, Math.min(1, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(255, Math.floor(numValue)));
    }

    const newRgba = { ...colorValues.rgba, [component]: clampedValue };
    const hex = Color(newRgba).hex();
    const hslArray = Color(newRgba).hsl().array();

    setColorValues({
      ...colorValues,
      hex: hex.slice(0, 7),
      rgb: { r: newRgba.r, g: newRgba.g, b: newRgba.b },
      hsl: { h: hslArray[0], s: hslArray[1], l: hslArray[2] },
      rgba: newRgba,
      hsla: { h: hslArray[0], s: hslArray[1], l: hslArray[2], a: newRgba.a },
    });
    onChange(hex);
  };

  // Handle HSL input change
  const handleHslChange = (component: "h" | "s" | "l", value: string) => {
    const numValue = Number.parseInt(value) || 0;
    let clampedValue;
    if (component === "h") {
      clampedValue = Math.max(0, Math.min(360, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(100, numValue));
    }
    const newHsl = { ...colorValues.hsl, [component]: clampedValue };
    const rgbArray = Color(newHsl).rgb().array();
    const hex = Color(newHsl).hex();

    setColorValues({
      ...colorValues,
      hex,
      rgb: { r: rgbArray[0], g: rgbArray[1], b: rgbArray[2] },
      hsl: newHsl,
    });
    onChange(hex);
  };

  // Handle HSLA input change
  const handleHslaChange = (
    component: "h" | "s" | "l" | "a",
    value: string
  ) => {
    if (!alpha || !colorValues.hsla) return;

    const numValue = Number.parseFloat(value) || 0;
    let clampedValue;

    if (component === "a") {
      clampedValue = Math.max(0, Math.min(1, numValue));
    } else if (component === "h") {
      clampedValue = Math.max(0, Math.min(360, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(100, numValue));
    }

    const newHsla = { ...colorValues.hsla, [component]: clampedValue };
    const rgbArray = Color(newHsla).rgb().array();
    const hex = Color(newHsla).hex();

    setColorValues({
      ...colorValues,
      hex: hex.slice(0, 7),
      rgb: { r: rgbArray[0], g: rgbArray[1], b: rgbArray[2] },
      hsl: { h: newHsla.h, s: newHsla.s, l: newHsla.l },
      rgba: { r: rgbArray[0], g: rgbArray[1], b: rgbArray[2], a: newHsla.a },
      hsla: newHsla,
    });
    onChange(hex);
  };

  // Handle popover close
  const handlePopoverChange = (open: boolean) => {
    if (!open) {
      setColorFormat(alpha ? "HEXA" : "HEX");
      onBlur?.();
    }
  };

  // Check if EyeDropper API is available
  const isEyeDropperAvailable = () => {
    return typeof window !== "undefined" && "EyeDropper" in window;
  };

  // Handle eyedropper click
  const handleEyeDropper = async () => {
    if (!isEyeDropperAvailable()) {
      alert("Eyedropper is not supported in your browser");
      return;
    }
    try {
      // @ts-expect-error - TypeScript doesn't have types for EyeDropper yet
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const pickedColor = result.sRGBHex;
      updateColorValues(pickedColor);
      onChange(pickedColor);
    } catch {
      console.log("User canceled the eyedropper");
    }
  };

  // Initialize color values on mount and when value changes from outside
  useEffect(() => {
    updateColorValues(value);
    setHexInputValue(value.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Get current hex value for display
  const getCurrentHexValue = () => {
    if (colorFormat === "HEX" || colorFormat === "HEXA") {
      return hexInputValue;
    }
    if (alpha && colorValues.rgba) {
      return Color(colorValues.rgba).hex();
    }
    return colorValues.hex;
  };

  return (
    <div className={cn(className)}>
      {label && <Label className="mb-3">{label}</Label>}
      <div className="flex items-center gap-4">
        <Popover onOpenChange={handlePopoverChange}>
          <PopoverTrigger asChild>
            {trigger ?? (
              <Button
                className="border-border h-12 w-12 border shadow-none relative overflow-hidden"
                size={"icon"}
                style={{ backgroundColor: hexInputValue }}
              >
                {alpha && colorValues.rgba && colorValues.rgba.a < 1 && (
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%),
                                    linear-gradient(-45deg, #ccc 25%, transparent 25%),
                                    linear-gradient(45deg, transparent 75%, #ccc 75%),
                                    linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                      backgroundSize: "8px 8px",
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                    }}
                  />
                )}
              </Button>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="color-picker space-y-3">
              <div className="relative">
                {showControls && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-1.5 -left-1 z-10 flex h-7 w-7 items-center gap-1 bg-transparent hover:bg-transparent"
                    onClick={handleEyeDropper}
                    disabled={!isEyeDropperAvailable()}
                  >
                    <PipetteIcon className="h-3 w-3" />
                  </Button>
                )}
                {alpha ? (
                  <HexAlphaColorPicker
                    className="!aspect-square !h-[244.79px] !w-[244.79px]"
                    color={value}
                    onChange={handleColorChange}
                  />
                ) : (
                  <HexColorPicker
                    className="!aspect-square !h-[244.79px] !w-[244.79px]"
                    color={value}
                    onChange={handleColorChange}
                  />
                )}
              </div>
              {showControls && (
                <div className="flex gap-2">
                  <Select value={colorFormat} onValueChange={v => v !== null && setColorFormat(v)}>
                    <SelectTrigger className="!h-7 !w-[4.8rem] rounded-sm px-2 py-1 !text-sm">
                      <SelectValue placeholder="Color" />
                    </SelectTrigger>
                    <SelectContent className="min-w-20">
                      {alpha ? (
                        <>
                          <SelectItem value="HEXA" className="text-sm h-7">
                            HEXA
                          </SelectItem>
                          <SelectItem value="RGBA" className="text-sm h-7">
                            RGBA
                          </SelectItem>
                          <SelectItem value="HSLA" className="text-sm h-7">
                            HSLA
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="HEX" className="text-sm h-7">
                            HEX
                          </SelectItem>
                          <SelectItem value="RGB" className="text-sm h-7">
                            RGB
                          </SelectItem>
                          <SelectItem value="HSL" className="text-sm h-7">
                            HSL
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {colorFormat === "HEX" || colorFormat === "HEXA" ? (
                    <Input
                      className="h-7 w-[160px] rounded-sm text-sm"
                      value={getCurrentHexValue()}
                      onChange={(e) => handleHexChange(e.target.value)}
                      placeholder={alpha ? "#FF0000FF" : "#FF0000"}
                      maxLength={alpha ? 9 : 7}
                    />
                  ) : colorFormat === "RGB" ? (
                    <div className="flex items-center">
                      <Input
                        className="h-7 w-13 rounded-l-sm rounded-r-none text-center text-sm "
                        value={colorValues.rgb.r}
                        onChange={(e) => handleRgbChange("r", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-13 rounded-none border-x-0 text-center text-sm"
                        value={colorValues.rgb.g}
                        onChange={(e) => handleRgbChange("g", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-13 rounded-l-none rounded-r-sm text-center text-sm"
                        value={colorValues.rgb.b}
                        onChange={(e) => handleRgbChange("b", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                    </div>
                  ) : colorFormat === "RGBA" && alpha && colorValues.rgba ? (
                    <div className="flex items-center">
                      <Input
                        className="h-7 w-10 rounded-l-sm rounded-r-none text-center text-sm px-1"
                        value={colorValues.rgba.r}
                        onChange={(e) => handleRgbaChange("r", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 rounded-none border-x-0 text-center text-sm px-1"
                        value={colorValues.rgba.g}
                        onChange={(e) => handleRgbaChange("g", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 rounded-none border-x-0 text-center text-sm px-1"
                        value={colorValues.rgba.b}
                        onChange={(e) => handleRgbaChange("b", e.target.value)}
                        placeholder="255"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 rounded-l-none rounded-r-sm text-center text-sm px-1"
                        value={colorValues.rgba.a.toFixed(2)}
                        onChange={(e) => handleRgbaChange("a", e.target.value)}
                        placeholder="1.00"
                        maxLength={4}
                      />
                    </div>
                  ) : colorFormat === "HSL" ? (
                    <div className="flex items-center">
                      <Input
                        className="h-7 w-13 rounded-l-sm rounded-r-none text-center text-sm"
                        value={colorValues.hsl.h}
                        onChange={(e) => handleHslChange("h", e.target.value)}
                        placeholder="360"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-13 rounded-none border-x-0 text-center text-sm"
                        value={colorValues.hsl.s}
                        onChange={(e) => handleHslChange("s", e.target.value)}
                        placeholder="100"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-13 rounded-l-none rounded-r-sm text-center text-sm"
                        value={colorValues.hsl.l}
                        onChange={(e) => handleHslChange("l", e.target.value)}
                        placeholder="100"
                        maxLength={3}
                      />
                    </div>
                  ) : colorFormat === "HSLA" && alpha && colorValues.hsla ? (
                    <div className="flex items-center">
                      <Input
                        className="h-7 w-10 px-1 rounded-l-sm rounded-r-none text-center text-sm"
                        value={colorValues.hsla.h}
                        onChange={(e) => handleHslaChange("h", e.target.value)}
                        placeholder="360"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 px-1 rounded-none border-x-0 text-center text-sm"
                        value={colorValues.hsla.s}
                        onChange={(e) => handleHslaChange("s", e.target.value)}
                        placeholder="100"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 px-1 rounded-none border-x-0 text-center text-sm"
                        value={colorValues.hsla.l}
                        onChange={(e) => handleHslaChange("l", e.target.value)}
                        placeholder="100"
                        maxLength={3}
                      />
                      <Input
                        className="h-7 w-10 px-1 rounded-l-none rounded-r-sm text-center text-sm"
                        value={colorValues.hsla.a.toFixed(2)}
                        onChange={(e) => handleHslaChange("a", e.target.value)}
                        placeholder="1.00"
                        maxLength={4}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {showControls && (
          <div className="relative flex-1 sm:flex-none">
            <Input
              placeholder={label}
              value={getCurrentHexValue()}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={onBlur}
              className={`h-12 uppercase ${error ? "border-destructive" : ""}`}
            />
            {isLoading && (
              <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </span>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-destructive mt-1.5 text-sm">{error}</p>}
      {hexInputError && (
        <p className="text-destructive mt-1.5 text-sm">{hexInputError}</p>
      )}
    </div>
  );
}
