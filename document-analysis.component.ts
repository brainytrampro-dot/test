import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-analysis-page',
  templateUrl: './analysis-page.component.html',
  styleUrls: ['./analysis-page.component.scss']
})
export class AnalysisPageComponent implements OnInit {

  zoom = 100;

  viewerLoading = false;

  viewerUrl!: SafeResourceUrl;

  selectedType: any;

  selectedAttachment: any;

  statusConfig: any = {

    CONFORME: {
      label: 'Conforme',
      class: 'success'
    },

    A_VERIFIER: {
      label: 'À vérifier',
      class: 'warning'
    },

    NON_CONFORME: {
      label: 'Non conforme',
      class: 'danger'
    },

    EN_COURS: {
      label: 'En cours',
      class: 'blue'
    }

  };

  attachmentTypes: any[] = [

    {
      id: 1,

      label: 'Bulletins de Paie',

      code: 'Bulletin',

      globalStatus: 'A_VERIFIER',

      ocrAverage: 79,

      attachments: [

        {
          id: 11,

          fileName: 'bulletin_mai_2026.pdf',

          uploadDate: '11/05/2026',

          fileType: 'PDF',

          statusIA: 'A_VERIFIER',

          confidence: 96,

          ocrQuality: 82,

          previewUrl:
            'assets/mock/bulletin.pdf',

          observations: [
            'Salaire brut : valeur différente'
          ],

          extractedData: [

            {
              key: 'Nom',
              ocrValue: 'DOCGNOIYIX',
              clientValue: 'DOCGNOIYIX',
              valid: true,
              confidence: 98
            },

            {
              key: 'N°CIN',
              ocrValue: '341092',
              clientValue: '341092',
              valid: true,
              confidence: 99
            }

          ]
        },

        {
          id: 12,

          fileName: 'bulletin_juin_2026.pdf',

          uploadDate: '10/05/2026',

          fileType: 'PDF',

          statusIA: 'NON_CONFORME',

          confidence: 71,

          ocrQuality: 58,

          previewUrl:
            'assets/mock/bulletin.pdf',

          observations: [

            'Salaire brut : valeur différente',

            'Salaire net : valeur différente'

          ],

          extractedData: [

            {
              key: 'Salaire brut',
              ocrValue: '12 500 MAD',
              clientValue: '12 800 MAD',
              valid: false,
              confidence: 60
            },

            {
              key: 'Salaire net',
              ocrValue: '10 200 MAD',
              clientValue: '10 500 MAD',
              valid: false,
              confidence: 58
            }

          ]
        }

      ]
    },

    {
      id: 2,

      label: 'Carte d’identité Nationale',

      code: 'CIN',

      globalStatus: 'CONFORME',

      ocrAverage: 98,

      attachments: [

        {
          id: 21,

          fileName: 'cin_recto.jpg',

          uploadDate: '09/05/2026',

          fileType: 'IMAGE',

          statusIA: 'CONFORME',

          confidence: 99,

          ocrQuality: 97,

          previewUrl:
            'assets/mock/cin.jpg',

          observations: [],

          extractedData: [

            {
              key: 'Nom',
              ocrValue: 'SALMAN',
              clientValue: 'SALMAN',
              valid: true,
              confidence: 100
            }

          ]
        }

      ]
    }

  ];

  constructor(
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {

    this.selectedType =
      this.attachmentTypes[0];

    this.selectedAttachment =
      this.selectedType.attachments[0];

    this.loadViewer(
      this.selectedAttachment
    );
  }

  selectType(type: any): void {

    this.selectedType = type;

    this.selectedAttachment =
      type.attachments[0];

    this.loadViewer(
      this.selectedAttachment
    );
  }

  openAttachment(
    attachment: any
  ): void {

    this.selectedAttachment =
      attachment;

    this.loadViewer(attachment);
  }

  loadViewer(
    attachment: any
  ): void {

    this.viewerLoading = true;

    setTimeout(() => {

      this.viewerUrl =
        this.sanitizer
          .bypassSecurityTrustResourceUrl(
            attachment.previewUrl
          );

      this.viewerLoading = false;

    }, 700);

    /**
     * REAL CASE
     *
     * this.documentService
     *   .download(id)
     *   .subscribe(blob => {
     *
     *    const url =
     *      URL.createObjectURL(blob);
     *
     *    this.viewerUrl =
     *      this.sanitizer
     *      .bypassSecurityTrustResourceUrl(url);
     * });
     */
  }

  download(
    attachment: any
  ): void {

    console.log(
      'DOWNLOAD',
      attachment
    );
  }

  zoomIn(): void {

    if (this.zoom < 200) {
      this.zoom += 10;
    }
  }

  zoomOut(): void {

    if (this.zoom > 50) {
      this.zoom -= 10;
    }
  }

  getProgressClass(
    value: number
  ): string {

    if (value >= 80) {
      return 'green-fill';
    }

    if (value >= 60) {
      return 'orange-fill';
    }

    return 'red-fill';
  }

}
