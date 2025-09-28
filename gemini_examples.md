Passing images to Gemini
You can provide images as input to Gemini using two methods:

Passing inline image data: Ideal for smaller files (total request size less than 20MB, including prompts).
Uploading images using the File API: Recommended for larger files or for reusing images across multiple requests.
Passing inline image data
You can pass inline image data in the request to generateContent. You can provide image data as Base64 encoded strings or by reading local files directly (depending on the language).

The following example shows how to read an image from a local file and pass it to generateContent API for processing.

Python
JavaScript
Go
REST

bytes, _ := os.ReadFile("path/to/small-sample.jpg")

parts := []*genai.Part{
  genai.NewPartFromBytes(bytes, "image/jpeg"),
  genai.NewPartFromText("Caption this image."),
}

contents := []*genai.Content{
  genai.NewContentFromParts(parts, genai.RoleUser),
}

result, _ := client.Models.GenerateContent(
  ctx,
  "gemini-2.5-flash",
  contents,
  nil,
)

fmt.Println(result.Text())
You can also fetch an image from a URL, convert it to bytes, and pass it to generateContent as shown in the following examples.

Python
JavaScript
Go
REST

package main

import (
  "context"
  "fmt"
  "os"
  "io"
  "net/http"
  "google.golang.org/genai"
)

func main() {
  ctx := context.Background()
  client, err := genai.NewClient(ctx, nil)
  if err != nil {
      log.Fatal(err)
  }

  // Download the image.
  imageResp, _ := http.Get("https://goo.gle/instrument-img")

  imageBytes, _ := io.ReadAll(imageResp.Body)

  parts := []*genai.Part{
    genai.NewPartFromBytes(imageBytes, "image/jpeg"),
    genai.NewPartFromText("Caption this image."),
  }

  contents := []*genai.Content{
    genai.NewContentFromParts(parts, genai.RoleUser),
  }

  result, _ := client.Models.GenerateContent(
    ctx,
    "gemini-2.5-flash",
    contents,
    nil,
  )

  fmt.Println(result.Text())
}
Note: Inline image data limits your total request size (text prompts, system instructions, and inline bytes) to 20MB. For larger requests, upload image files using the File API. Files API is also more efficient for scenarios that use the same image repeatedly.
Uploading images using the File API
For large files or to be able to use the same image file repeatedly, use the Files API. The following code uploads an image file and then uses the file in a call to generateContent. See the Files API guide for more information and examples.

Python
JavaScript
Go
REST

package main

import (
  "context"
  "fmt"
  "os"
  "google.golang.org/genai"
)

func main() {
  ctx := context.Background()
  client, err := genai.NewClient(ctx, nil)
  if err != nil {
      log.Fatal(err)
  }

  uploadedFile, _ := client.Files.UploadFromPath(ctx, "path/to/sample.jpg", nil)

  parts := []*genai.Part{
      genai.NewPartFromText("Caption this image."),
      genai.NewPartFromURI(uploadedFile.URI, uploadedFile.MIMEType),
  }

  contents := []*genai.Content{
      genai.NewContentFromParts(parts, genai.RoleUser),
  }

  result, _ := client.Models.GenerateContent(
      ctx,
      "gemini-2.5-flash",
      contents,
      nil,
  )

  fmt.Println(result.Text())
}
Prompting with multiple images
You can provide multiple images in a single prompt by including multiple image Part objects in the contents array. These can be a mix of inline data (local files or URLs) and File API references.

Python
JavaScript
Go
REST

// Upload the first image
image1Path := "path/to/image1.jpg"
uploadedFile, _ := client.Files.UploadFromPath(ctx, image1Path, nil)

// Prepare the second image as inline data
image2Path := "path/to/image2.jpeg"
imgBytes, _ := os.ReadFile(image2Path)

parts := []*genai.Part{
  genai.NewPartFromText("What is different between these two images?"),
  genai.NewPartFromBytes(imgBytes, "image/jpeg"),
  genai.NewPartFromURI(uploadedFile.URI, uploadedFile.MIMEType),
}

contents := []*genai.Content{
  genai.NewContentFromParts(parts, genai.RoleUser),
}

result, _ := client.Models.GenerateContent(
  ctx,
  "gemini-2.5-flash",
  contents,
  nil,
)

fmt.Println(result.Text())
Object detection
From Gemini 2.0 onwards, models are further trained to detect objects in an image and get their bounding box coordinates. The coordinates, relative to image dimensions, scale to [0, 1000]. You need to descale these coordinates based on your original image size.

Python

from google import genai
from google.genai import types
from PIL import Image
import json

client = genai.Client()
prompt = "Detect the all of the prominent items in the image. The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000."

image = Image.open("/path/to/image.png")

config = types.GenerateContentConfig(
  response_mime_type="application/json"
  )

response = client.models.generate_content(model="gemini-2.5-flash",
                                          contents=[image, prompt],
                                          config=config
                                          )

width, height = image.size
bounding_boxes = json.loads(response.text)

converted_bounding_boxes = []
for bounding_box in bounding_boxes:
    abs_y1 = int(bounding_box["box_2d"][0]/1000 * height)
    abs_x1 = int(bounding_box["box_2d"][1]/1000 * width)
    abs_y2 = int(bounding_box["box_2d"][2]/1000 * height)
    abs_x2 = int(bounding_box["box_2d"][3]/1000 * width)
    converted_bounding_boxes.append([abs_x1, abs_y1, abs_x2, abs_y2])

print("Image size: ", width, height)
print("Bounding boxes:", converted_bounding_boxes)
