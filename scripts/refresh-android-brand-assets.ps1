$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies ([System.Drawing.Bitmap].Assembly.Location) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class StockroomAndroidArt {
  static PointF P(float x, float y, float ox, float oy, float scale) { return new PointF(ox + x * scale, oy + y * scale); }
  static void Lines(Graphics g, Pen pen, float ox, float oy, float scale, params float[] xy) {
    var points = new PointF[xy.Length / 2];
    for (int i = 0; i < points.Length; i++) points[i] = P(xy[i * 2], xy[i * 2 + 1], ox, oy, scale);
    g.DrawLines(pen, points);
  }
  static void Storefront(Graphics g, float x, float y, float size) {
    float scale = size / 512f;
    using (var background = new SolidBrush(Color.FromArgb(23,63,53)))
    using (var roof = new SolidBrush(Color.FromArgb(244,241,232)))
    using (var facade = new SolidBrush(Color.FromArgb(121,182,158))) {
      g.FillRectangle(background, x, y, size, size);
      g.FillRectangle(roof, x + 124*scale, y + 166*scale, 264*scale, 180*scale);
      g.FillRectangle(facade, x + 108*scale, y + 210*scale, 296*scale, 54*scale);
      g.FillRectangle(facade, x + 154*scale, y + 264*scale, 86*scale, 82*scale);
      g.FillRectangle(facade, x + 272*scale, y + 264*scale, 86*scale, 82*scale);
      g.FillRectangle(background, x + 175*scale, y + 126*scale, 162*scale, 40*scale);
    }
  }
  static void SaveIcon(string path, int size) {
    using (var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb))
    using (var g = Graphics.FromImage(bitmap)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      Storefront(g, 0, 0, size);
      bitmap.Save(path, ImageFormat.Png);
    }
  }
  static void SaveSplash(string path) {
    int width, height;
    using (var old = Image.FromFile(path)) { width = old.Width; height = old.Height; }
    using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
    using (var g = Graphics.FromImage(bitmap)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.Clear(Color.White);
      float size = Math.Min(width, height) * 0.36f;
      Storefront(g, (width-size)/2f, (height-size)/2f, size);
      bitmap.Save(path, ImageFormat.Png);
    }
  }
  public static void Refresh(string root) {
    string[] densities = { "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi" };
    int[] sizes = { 48, 72, 96, 144, 192 };
    for (int i=0; i<densities.Length; i++) {
      string dir = System.IO.Path.Combine(root, "mipmap-" + densities[i]);
      foreach (string name in new[] { "ic_launcher.png", "ic_launcher_round.png" }) SaveIcon(System.IO.Path.Combine(dir, name), sizes[i]);
    }
    foreach (string path in System.IO.Directory.GetFiles(root, "splash.png", System.IO.SearchOption.AllDirectories)) SaveSplash(path);
  }
}
'@

$resources = Join-Path $PSScriptRoot '..\android\app\src\main\res'
[StockroomAndroidArt]::Refresh((Resolve-Path $resources).Path)
