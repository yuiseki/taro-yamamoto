PImage img;

void setup()
  {
  size(1900,1000);
  img = loadImage("YamaFace.png");
  }
  
  void draw()
  {
    image(img,mouseX-50,mouseY-50);
  }
